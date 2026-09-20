// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { VISION_SHRINK_TARGET_BYTES } from "@/core/ai/models";
import { useAiAccess } from "@/core/ai/use-ai-access";
import { shrinkImageToLimit } from "@/images/shrink";
import { cn } from "@/lib/utils";
import { AlLogo } from "./al-logo";

/** Komunikat awaryjny improve, gdy endpoint nie odpowie zreadowalnym błędem. */
const FALLBACK_IMPROVE = "Nie udało się poprawić opisu. Spróbuj ponownie.";
/** Komunikat awaryjny propose (sieć, pomniejszenie, parsowanie odpowiedzi). */
const FALLBACK_PROPOSE = "Nie udało się zaproponować opisu. Spróbuj ponownie.";
/** Komunikat awaryjny album-title (sieć, parsowanie odpowiedzi). */
const FALLBACK_TITLE = "Nie udało się zaproponować tytułu. Spróbuj ponownie.";

/** Gradient identycznościowy AL („jasnozielony → butelkowy") — wspólny dla wszystkich wariantów. */
const GRADIENT_CLASS = "bg-linear-to-r from-[#8bc34a] to-[#006a4e] text-white hover:opacity-90";

/** Stan „Generowanie…" — secondary (niebieski #0c275f) jak w tworzeniu posta. */
const SECONDARY_CLASS = "bg-[#0c275f] text-white hover:bg-[#0c275f]/90";

type GradientAiButtonProps =
	| {
			target: "post-description";
			text: string;
			/** Podstawa propozycji (pierwsze zdjęcie); undefined = bez propose. */
			file?: File | null;
			onResult: (text: string) => void;
			/** Zewnętrzne wyłączenie (np. podczas submitu formularza). */
			disabled?: boolean;
			/** Dodatkowe klasy przycisku (np. wysokość dopasowana do sąsiada). */
			buttonClass?: string;
	  }
	| {
			target: "comment";
			text: string;
			onResult: (text: string) => void;
			disabled?: boolean;
			/** Dodatkowe klasy przycisku (np. wysokość dopasowana do sąsiada). */
			buttonClass?: string;
	  }
	| {
			target: "album-title";
			files: File[];
			onResult: (text: string) => void;
			disabled?: boolean;
			/** Dodatkowe klasy przycisku (np. wysokość dopasowana do sąsiada). */
			buttonClass?: string;
	  };

/** Który przycisk aktualnie generuje (tylko kliknięty pokazuje „Generowanie…"). */
type AiButtonKind = "improve" | "propose" | "album";

/**
 * Buduje payload POST /api/ai/generate dla wariantu przycisku + komunikat
 * awaryjny właściwy dla wariantu. Jedyne miejsce mapowania wariant → tryb
 * endpointa; prywatność albumu (tylko nazwy+daty) siedzi tutaj.
 */
async function generateRequestFor(props: GradientAiButtonProps): Promise<{
	body: unknown;
	fallback: string;
}> {
	if (props.target === "album-title") {
		return {
			body: {
				mode: "album-title",
				// Prywatność (F5 #192): do endpointa lecą WYŁĄCZNIE nazwy plików
				// i daty — nigdy zawartość plików.
				files: props.files.map((file) => ({
					name: file.name,
					date: new Date(file.lastModified).toISOString(),
				})),
			},
			fallback: FALLBACK_TITLE,
		};
	}
	if (props.target === "comment") {
		return {
			body: { mode: "improve-comment", text: props.text },
			fallback: FALLBACK_IMPROVE,
		};
	}
	const improving = props.text.trim().length > 0;
	return {
		body: improving
			? { mode: "improve-post-description", text: props.text }
			: {
					mode: "propose-post-description",
					image: await readAsDataUrl(await shrinkForPropose(props.file)),
				},
		fallback: improving ? FALLBACK_IMPROVE : FALLBACK_PROPOSE,
	};
}

/**
 * Pojedynczy przycisk AL: gradient w idle, secondary (#0c275f) + biały
 * kropkowy Loader i wspólny napis „Generowanie…" w trakcie (reviza #187,
 * spójnie z publikowaniem posta). Logo AL zamiast ikony Sparkles.
 */
function AiButton({
	busy,
	disabled = false,
	onClick,
	label,
	className,
}: {
	busy: boolean;
	disabled?: boolean;
	onClick: () => void;
	label: string;
	/** Dodatkowe klasy (np. wysokość dopasowana do sąsiada — reviza #187). */
	className?: string;
}) {
	return (
		<Button
			type="button"
			size="sm"
			disabled={disabled || busy}
			onClick={onClick}
			className={cn(busy ? SECONDARY_CLASS : GRADIENT_CLASS, className)}
		>
			{busy ? <Loader loading size={4} color="#FFFFFF" /> : <AlLogo className="size-4" />}
			{busy ? "Generowanie…" : label}
		</Button>
	);
}

/**
 * Gradientowy przycisk AL (F2 #189 + F3 #190 + F4 #191 + F5 #192). Cała para
 * / pojedynczy przycisk znika dla userów bez skutecznego dostępu do AL
 * (`useAiAccess`) i dopóki stan dostępu jest nieznany. Aktywny jest ten
 * wariant, który ma sens: „Popraw opis" przy treści w polu, „Zaproponuj opis"
 * przy pustym polu i przypiętym zdjęciu, „Zaproponuj tytuł" gdy wybrano zdjęcia
 * do albumu. Błąd = inline, pole wynikowe nietknięte (propose-and-edit).
 */
export function GradientAiButton(props: GradientAiButtonProps) {
	const { data: access } = useAiAccess();
	const [busyKind, setBusyKind] = useState<AiButtonKind | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (access?.effective !== true) return null;

	async function run(kind: AiButtonKind) {
		setError(null);
		setBusyKind(kind);
		let fallback = FALLBACK_IMPROVE;
		try {
			const request = await generateRequestFor(props);
			fallback = request.fallback;
			const res = await fetch("/api/ai/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(request.body),
			});
			const json = (await res.json().catch(() => null)) as {
				data?: { text?: string };
				error?: string;
			} | null;
			if (!res.ok || !json?.data?.text) {
				setError(json?.error ?? fallback);
				return;
			}
			props.onResult(json.data.text);
		} catch {
			setError(fallback);
		} finally {
			setBusyKind(null);
		}
	}

	// Etykiety i stan disabled zależą od wariantu; wspólny jest access-gate,
	// inline error oraz zasada: generuje się TYLKO kliknięty przycisk, drugi
	// jest w tym czasie wygaszony (reviza #187).
	if (props.target === "album-title") {
		return (
			<>
				<AiButton
					busy={busyKind === "album"}
					className={props.buttonClass}
					disabled={props.disabled || busyKind !== null || props.files.length === 0}
					onClick={() => run("album")}
					label="Zaproponuj tytuł"
				/>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
			</>
		);
	}

	const hasText = props.text.trim().length > 0;
	const commentTarget = props.target === "comment";

	return (
		<div className="flex items-center justify-end gap-3">
			{error && (
				<p role="alert" className="mr-auto text-sm text-destructive">
					{error}
				</p>
			)}
			<AiButton
				busy={busyKind === "improve"}
				className={props.buttonClass}
				disabled={props.disabled || busyKind !== null || !hasText}
				onClick={() => run("improve")}
				label="Popraw opis"
			/>
			{!commentTarget && props.file !== undefined && (
				<AiButton
					busy={busyKind === "propose"}
					className={props.buttonClass}
					disabled={props.disabled || busyKind !== null || hasText || !props.file}
					onClick={() => run("propose")}
					label="Zaproponuj opis"
				/>
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
