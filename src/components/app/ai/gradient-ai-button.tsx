// SPDX-License-Identifier: AGPL-3.0-or-later
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAiAccess } from "@/core/ai/use-ai-access";

/** Komunikat awaryjny, gdy endpoint nie odpowie zreadowalnym błędem (sieć itp.). */
const FALLBACK_ERROR = "Nie udało się poprawić opisu. Spróbuj ponownie.";

/**
 * Wspólny gradientowy przycisk AL (F2 #189) — element identycznościowy AL v2
 * („jasnozielony → butelkowy" gradient z oryginalnego PRD), przyszłe fazy
 * (F3–F5) go reużyją. Ukryty CAŁKOWICIE (nie tylko wyłączony) dla userów bez
 * skutecznego dostępu do AL — to samo źródło prawdy co wejścia do czatu
 * (`useAiAccess`): brak danych (ładowanie) i błąd zapytania = ukryty.
 * Przycisk pojawia się dopiero, gdy pole ma treść.
 *
 * Klik → POST /api/ai/generate (tryb improve-post-description); sukces ląduje
 * w `onImproved` (rodzic podmienia treść pola), porażka → inline komunikat
 * po polsku, treść nietknięta.
 */
export function GradientAiButton({
	text,
	onImproved,
	disabled = false,
}: {
	text: string;
	onImproved: (text: string) => void;
	/** Zewnętrzne wyłączenie (np. podczas submitu formularza). */
	disabled?: boolean;
}) {
	const { data: access } = useAiAccess();
	const [improving, setImproving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (access?.effective !== true || text.trim().length === 0) return null;

	async function handleImprove() {
		setError(null);
		setImproving(true);
		try {
			const res = await fetch("/api/ai/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mode: "improve-post-description", text }),
			});
			const json = (await res.json().catch(() => null)) as {
				data?: { text?: string };
				error?: string;
			} | null;
			if (!res.ok || !json?.data?.text) {
				setError(json?.error ?? FALLBACK_ERROR);
				return;
			}
			onImproved(json.data.text);
		} catch {
			setError(FALLBACK_ERROR);
		} finally {
			setImproving(false);
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
				disabled={disabled || improving}
				onClick={handleImprove}
				// Gradient identycznościowy AL („jasnozielony → butelkowy", oryginalny
				// PRD) — celowo stały w obu motywach; to znak rozpoznawczy „tu działa
				// AI", nie semantyczny kolor UI.
				className="bg-linear-to-r from-[#8bc34a] to-[#006a4e] text-white hover:opacity-90"
			>
				<Sparkles className="size-4" />
				{improving ? "Poprawiam…" : "Popraw opis"}
			</Button>
		</div>
	);
}
