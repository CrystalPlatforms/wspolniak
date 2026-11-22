// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconMapPin } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { postLocationSchema } from "@/db/posts/schema";

/** Szkic lokalizacji (etykieta trzymana razem ze współrzędnymi). */
export interface LocationDraft {
	lat: number;
	lng: number;
	label: string;
}

export interface ComposerLocationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Zapisany szkic (z chipa); null = nowa lokalizacja (mapa czysta). */
	value: LocationDraft | null;
	onSave: (draft: LocationDraft) => void;
}

/**
 * Chunk Leaflet + kafle lecą dopiero po otwarciu dialogu (perf, #239).
 */
const PostLocationPicker = lazy(() => import("@/components/app/post-location-picker"));

/**
 * Dialog lokalizacji (#242, reviza usera: zamiast rozwijanej sekcji): mapa
 * Leaflet + opcjonalna etykieta. Bez pinezki "Zapisz" jest zablokowany.
 * Edycja działa na kopii szkicu — "Anuluj" odrzuca, zapis waliduje schematem
 * wysyłki (zakresy geo + limit etykiety).
 */
export function ComposerLocationDialog({
	open,
	onOpenChange,
	value,
	onSave,
}: ComposerLocationDialogProps) {
	const [pin, setPin] = useState<LocationDraft | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Otwarcie = start od kopii zapisanego szkicu (albo czysta mapa, centrum PL).
	useEffect(() => {
		if (open) {
			setPin(value ? { ...value } : null);
			setError(null);
		}
	}, [open, value]);

	function handleSave() {
		if (!pin) return;
		// Nazwa jest wymagana (reviza usera) — bez niej nie ma zapisu.
		const label = pin.label.trim();
		if (!label) {
			setError("Podaj nazwę miejsca");
			return;
		}
		const parsed = postLocationSchema.safeParse({ lat: pin.lat, lng: pin.lng, label });
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Sprawdź lokalizację");
			return;
		}
		onSave({ lat: pin.lat, lng: pin.lng, label });
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Lokalizacja</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Suspense
						fallback={
							<div className="flex h-64 items-center justify-center rounded-md border border-input text-sm text-muted-foreground">
								Ładowanie mapy…
							</div>
						}
					>
						<PostLocationPicker
							value={pin ? { lat: pin.lat, lng: pin.lng } : null}
							onChange={(v) =>
								setPin((prev) => (v ? { lat: v.lat, lng: v.lng, label: prev?.label ?? "" } : null))
							}
						/>
					</Suspense>
					<div>
						<label
							htmlFor="composer-location-label"
							className="text-xs font-medium text-muted-foreground"
						>
							Nazwa
						</label>
						<input
							id="composer-location-label"
							value={pin?.label ?? ""}
							onChange={(e) =>
								setPin((prev) => ({
									lat: prev?.lat ?? 0,
									lng: prev?.lng ?? 0,
									label: e.target.value,
								}))
							}
							maxLength={200}
							placeholder="np. Domek babci"
							className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					{error ? (
						<p role="alert" className="text-xs text-destructive">
							{error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Anuluj
					</Button>
					<Button type="button" onClick={handleSave} disabled={!pin}>
						<IconMapPin className="size-4" aria-hidden="true" />
						Zapisz lokalizację
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Walidacja szkicu schematem wysyłki; zwraca komunikat albo null (submit/testy). */
export function locationDraftError(draft: LocationDraft): string | null {
	const label = draft.label.trim();
	const parsed = postLocationSchema.safeParse({
		lat: draft.lat,
		lng: draft.lng,
		...(label ? { label } : {}),
	});
	if (parsed.success) return null;
	return parsed.error.issues[0]?.message ?? "Sprawdź lokalizację przed publikacją";
}
