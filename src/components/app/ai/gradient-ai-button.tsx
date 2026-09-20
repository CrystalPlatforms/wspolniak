// SPDX-License-Identifier: AGPL-3.0-or-later
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VISION_SHRINK_TARGET_BYTES } from "@/core/ai/models";
import { useAiAccess } from "@/core/ai/use-ai-access";
import { shrinkImageToLimit } from "@/images/shrink";

/** Komunikat awaryjny improve, gdy endpoint nie odpowie zreadowalnym błędem. */
const FALLBACK_IMPROVE = "Nie udało się poprawić opisu. Spróbuj ponownie.";
/** Komunikat awaryjny propose (sieć, pomniejszenie, parsowanie odpowiedzi). */
const FALLBACK_PROPOSE = "Nie udało się zaproponować opisu. Spróbuj ponownie.";

/** Gradient identycznościowy AL („jasnozielony → butelkowy") — wspólny dla pary. */
const GRADIENT_CLASS = "bg-linear-to-r from-[#8bc34a] to-[#006a4e] text-white hover:opacity-90";

type AiButtonKind = "improve" | "propose";

/**
 * Para gradientowych przycisków AL (F2 #189 improve + F3 #190 propose) — oba
 * WIDOCZNE jednocześnie (decyzja HITL 2026-09-20), aktywny jest ten, który ma
 * sens: „Popraw opis" przy treści w polu, „Zaproponuj opis" przy pustym polu
 * i przypiętym zdjęciu. Bez zdjęcia albo z treścią wygaszony jest propose,
 * bez treści — improve. Cała para znika dla userów bez skutecznego dostępu do
 * AL (`useAiAccess`) i dopóki stan dostępu jest nieznany.
 * `file === undefined` = tryb propose nieobecny (formularz edycji) — wtedy
 * renderujemy samo improve.
 */
export function GradientAiButton({
	text,
	file,
	onResult,
	disabled = false,
}: {
	text: string;
	/** Podstawa propozycji (pierwsze zdjęcie); undefined = bez propose. */
	file?: File | null;
	onResult: (text: string) => void;
	/** Zewnętrzne wyłączenie (np. podczas submitu formularza). */
	disabled?: boolean;
}) {
	const { data: access } = useAiAccess();
	const [improving, setImproving] = useState(false);
	const [proposing, setProposing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (access?.effective !== true) return null;

	const hasText = text.trim().length > 0;
	const busy = improving || proposing;
	const proposeAvailable = file !== undefined;

	async function run(kind: AiButtonKind) {
		setError(null);
		if (kind === "improve") setImproving(true);
		else setProposing(true);
		try {
			const body =
				kind === "improve"
					? { mode: "improve-post-description", text }
					: {
							mode: "propose-post-description",
							image: await readAsDataUrl(await shrinkForPropose(file)),
						};
			const res = await fetch("/api/ai/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const json = (await res.json().catch(() => null)) as {
				data?: { text?: string };
				error?: string;
			} | null;
			if (!res.ok || !json?.data?.text) {
				setError(json?.error ?? (kind === "improve" ? FALLBACK_IMPROVE : FALLBACK_PROPOSE));
				return;
			}
			onResult(json.data.text);
		} catch {
			setError(kind === "improve" ? FALLBACK_IMPROVE : FALLBACK_PROPOSE);
		} finally {
			if (kind === "improve") setImproving(false);
			else setProposing(false);
		}
	}

	return (
		<div className="flex items-center justify-end gap-3">
			{error && (
				<p role="alert" className="mr-auto text-sm text-destructive">
					{error}
				</p>
			)}
			<Button
				type="button"
				size="sm"
				disabled={disabled || busy || !hasText}
				onClick={() => run("improve")}
				className={GRADIENT_CLASS}
			>
				<Sparkles className="size-4" />
				{improving ? "Poprawiam…" : "Popraw opis"}
			</Button>
			{proposeAvailable && (
				<Button
					type="button"
					size="sm"
					disabled={disabled || busy || hasText || !file}
					onClick={() => run("propose")}
					className={GRADIENT_CLASS}
				>
					<Sparkles className="size-4" />
					{proposing ? "Proponuję…" : "Zaproponuj opis"}
				</Button>
			)}
		</div>
	);
}

/** Surowy plik → data URL base64 (payload vision: tylko bajty, zero URL-i). */
function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("readAsDataUrl failed"));
		reader.readAsDataURL(file);
	});
}

/** Zdjęcia powyżej celu pomniejszamy — base64 musi zmieścić się w limicie Groqa. */
async function shrinkForPropose(file: File | null | undefined): Promise<File> {
	if (!file) throw new Error("brak zdjęcia do propozycji");
	if (file.size <= VISION_SHRINK_TARGET_BYTES) return file;
	return shrinkImageToLimit(file, VISION_SHRINK_TARGET_BYTES);
}
