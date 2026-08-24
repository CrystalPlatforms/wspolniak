// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Dices, Pencil, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";

// Rewizja usera (2026-08-24): kody /share wyłącznie cyfrowe, 4–20 znaków;
// generator losuje 4 cyfry. QR usunięte w całości (razem z zależnością qrcode).
const CODE_DIGITS = "0123456789";
const CODE_MAX = 20;

function generateShareCode(length = 4): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = "";
	for (const byte of bytes) {
		out += CODE_DIGITS[byte % CODE_DIGITS.length] ?? "";
	}
	return out;
}

export interface ShareCodeDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Dialog admina „Kod dostępu /share" (#166): podgląd/zmiana kodu (generator
 *  losowych 4 cyfr albo własny 4–20 cyfr — serwer waliduje). Stan wewnętrzny —
 *  query/mutation na /api/admin/share-code. */
export function ShareCodeDialog({ open, onOpenChange }: ShareCodeDialogProps) {
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);

	const codeQuery = useQuery({
		queryKey: ["admin", "share-code"],
		queryFn: async () => {
			const res = await fetch("/api/admin/share-code");
			const json = (await res.json()) as { data: { code: string | null } };
			return json.data.code;
		},
	});

	const saveMutation = useMutation({
		mutationFn: async (code: string) => {
			const res = await fetch("/api/admin/share-code", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Nie udało się zapisać kodu");
			}
		},
		onSuccess: async () => {
			setEditing(false);
			await queryClient.invalidateQueries({ queryKey: ["admin", "share-code"] });
		},
	});

	const currentCode = codeQuery.data ?? null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>Kod dostępu /share</DialogTitle>
				</DialogHeader>

				{saveMutation.isError && <Alert variant="destructive">{saveMutation.error.message}</Alert>}

				{codeQuery.isPending ? (
					<div className="flex justify-center py-6">
						<Loader size={6} />
					</div>
				) : editing ? (
					<ShareCodeEditor
						isSaving={saveMutation.isPending}
						onSave={(code) => saveMutation.mutate(code)}
						onCancel={() => {
							setEditing(false);
							saveMutation.reset();
						}}
					/>
				) : (
					<div className="flex items-center gap-2">
						<code className="rounded bg-muted px-2 py-1 text-sm font-bold text-foreground">
							{currentCode ?? "Brak"}
						</code>
						{currentCode && <CopyCodeButton code={currentCode} />}
						<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
							<Pencil className="h-4 w-4" />
							Zmień kod
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

interface ShareCodeEditorProps {
	isSaving: boolean;
	onSave: (code: string) => void;
	onCancel: () => void;
}

/** Formularz zmiany kodu: generator 4 losowych cyfr (domyślnie) lub własny 4–20 cyfr. */
function ShareCodeEditor({ isSaving, onSave, onCancel }: ShareCodeEditorProps) {
	const [codeInput, setCodeInput] = useState("");
	const trimmed = codeInput.trim();
	const isValid = /^\d{4,20}$/.test(trimmed);

	function handleSave(event: FormEvent) {
		event.preventDefault();
		if (!isValid || isSaving) return;
		onSave(trimmed);
	}

	return (
		<form onSubmit={handleSave} className="space-y-2">
			<Label htmlFor="new-share-code">Nowy kod</Label>
			<div className="flex gap-2">
				<Input
					id="new-share-code"
					type="text"
					inputMode="numeric"
					pattern="\d*"
					value={codeInput}
					onChange={(e) => setCodeInput(e.target.value)}
					placeholder="np. 4827"
					className="flex-1"
					maxLength={CODE_MAX}
					autoComplete="off"
				/>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => setCodeInput(generateShareCode())}
				>
					<Dices className="h-4 w-4" />
					Wygeneruj losowy kod
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				4–20 cyfr. Generator losuje 4 cyfry — możesz też wpisać własny.
			</p>
			<div className="flex gap-2">
				<Button type="submit" size="sm" disabled={!isValid || isSaving}>
					{isSaving ? "Zapisuję..." : "Zapisz"}
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					<X className="h-4 w-4" />
					Anuluj
				</Button>
			</div>
		</form>
	);
}

function CopyCodeButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			// brak uprawnień do schowka — po prostu nic
		}
	}

	return (
		<Button size="sm" variant="outline" aria-label="Kopiuj kod" onClick={handleCopy}>
			{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
		</Button>
	);
}
