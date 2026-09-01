// SPDX-License-Identifier: AGPL-3.0-or-later

import { Check, Copy, Info, Link, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";
import { Switch } from "@/components/ui/switch";

/** Członek rodziny z `GET /api/admin/members` (wiersz panelu admina). */
export interface Member {
	id: string;
	name: string;
	role: string;
	createdAt: string;
	// AL (F1 #179) — blokada AI nałożona przez admina na tego członka.
	aiBlocked: boolean;
}

interface MemberRowProps {
	member: Member;
	isRegenerating: boolean;
	isDeleting: boolean;
	/** Zapis przełącznika AL w toku — blokuje switch na czas mutacji. */
	isAiSaving: boolean;
	/** Generuje nowy magic link; zwraca go do wyświetlenia w dialogu Info. */
	onRegenerate: () => Promise<string>;
	onDelete: () => void;
	onRename: (id: string, name: string) => Promise<void>;
	/** Ustaw blokadę AL dla członka (true = AI zablokowane). */
	onAiBlockedChange: (blocked: boolean) => void;
}

/**
 * Wiersz członka w panelu admina — na liście tylko imię, badge roli i przycisk
 * „Info". Wszystkie opcje członka (przełącznik AL, zmiana imienia, nowy link
 * logowania, usuwanie) otwierają się w dialogu Info (przebudowa 2026-09-01,
 * na prośbę usera — czystszy główny ekran admina). Usuwać można tylko
 * członków; switch AL może zablokować każdego, także admina.
 */
export function MemberRow({
	member,
	isRegenerating,
	isDeleting,
	isAiSaving,
	onRegenerate,
	onDelete,
	onRename,
	onAiBlockedChange,
}: MemberRowProps) {
	const [infoOpen, setInfoOpen] = useState(false);

	return (
		<div className="rounded-lg border border-border bg-card p-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1">
					<span className="font-medium text-foreground">{member.name}</span>
					<span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
						{member.role}
					</span>
				</div>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => setInfoOpen(true)}
					title={`Opcje członka ${member.name}`}
					aria-label={`Opcje członka ${member.name}`}
				>
					<Info className="h-4 w-4" />
				</Button>
			</div>
			<MemberInfoDialog
				member={member}
				open={infoOpen}
				onOpenChange={setInfoOpen}
				isRegenerating={isRegenerating}
				isDeleting={isDeleting}
				isAiSaving={isAiSaving}
				onRegenerate={onRegenerate}
				onDelete={onDelete}
				onRename={onRename}
				onAiBlockedChange={onAiBlockedChange}
			/>
		</div>
	);
}

/**
 * Dialog „Info" członka — wszystkie opcje usera w jednym miejscu: przełącznik
 * AL, zmiana imienia, generowanie magic linka (z kopiowaniem) i usuwanie
 * (tylko członkowie). Otwierany przyciskiem Info na wierszu listy.
 */
function MemberInfoDialog({
	member,
	open,
	onOpenChange,
	isRegenerating,
	isDeleting,
	isAiSaving,
	onRegenerate,
	onDelete,
	onRename,
	onAiBlockedChange,
}: MemberRowProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
	const [draft, setDraft] = useState(member.name);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [magicLink, setMagicLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Przy każdym otwarciu dialogu: świeże imię do edycji, czysty błąd/kopiapka.
	useEffect(() => {
		if (open) {
			setDraft(member.name);
			setError(null);
			setCopied(false);
		}
	}, [open, member.name]);

	async function handleSave() {
		const trimmed = draft.trim();
		if (!trimmed) {
			setError("Imię nie może być puste");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await onRename(member.id, trimmed);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Nie udało się zmienić imienia");
		} finally {
			setSaving(false);
		}
	}

	async function handleRegenerate() {
		setError(null);
		try {
			const link = await onRegenerate();
			setMagicLink(link);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Nie udało się wygenerować linku");
		}
	}

	async function handleCopy() {
		if (!magicLink) return;
		await navigator.clipboard.writeText(magicLink);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{member.name}
						<span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
							{member.role}
						</span>
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{error && <Alert variant="destructive">{error}</Alert>}

					<section className="flex items-center justify-between gap-4">
						<span className="font-medium text-foreground">AL (asystent AI)</span>
						<Switch
							checked={!member.aiBlocked}
							disabled={isAiSaving}
							onCheckedChange={(checked) => onAiBlockedChange(!checked)}
							aria-label={`AI dla ${member.name}`}
						/>
					</section>

					<section className="space-y-2">
						<p className="text-sm font-medium text-foreground">Imię</p>
						<div className="flex gap-2">
							<Input
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSave();
								}}
								placeholder="Imię członka..."
								aria-label="Imię członka"
								maxLength={30}
								disabled={saving}
							/>
							<Button
								size="sm"
								onClick={handleSave}
								disabled={saving || draft.trim() === member.name}
								title="Zapisz imię"
							>
								{saving ? <Loader loading={saving} /> : <Check className="h-4 w-4" />}
							</Button>
						</div>
					</section>

					<section className="space-y-2">
						{magicLink && (
							<div className="flex items-center gap-2">
								<code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs text-foreground">
									{magicLink}
								</code>
								<Button size="sm" variant="outline" onClick={handleCopy} title="Kopiuj link">
									{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
								</Button>
							</div>
						)}
						{/* Generowanie linka i usuwanie w jednym rzędzie (przebudowa UI
						    2026-09-01); usuwanie tylko dla członków, nie admina. */}
						<div className="flex gap-2">
							<Button
								size="sm"
								variant="outline"
								className="flex-1"
								onClick={handleRegenerate}
								disabled={isRegenerating}
								title="Nowy link logowania"
							>
								{isRegenerating ? (
									<Loader loading={isRegenerating} />
								) : (
									<Link className="h-4 w-4" />
								)}
								{magicLink ? "Wygeneruj ponownie" : "Wygeneruj link"}
							</Button>
							{member.role !== "admin" && (
								<Button
									size="sm"
									variant="ghost"
									className="text-destructive hover:bg-destructive/10 hover:text-destructive"
									onClick={onDelete}
									disabled={isDeleting}
									title="Usuń członka"
								>
									{isDeleting ? <Loader loading={isDeleting} /> : <Trash2 className="h-4 w-4" />}
									Usuń
								</Button>
							)}
						</div>
					</section>
				</div>
			</DialogContent>
		</Dialog>
	);
}
