// SPDX-License-Identifier: AGPL-3.0-or-later

import L from "leaflet";
import { Crosshair, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ui/loader";
import "leaflet/dist/leaflet.css";

export interface ChatLocationFormProps {
	/** Zapis → ChatView wysyła wiadomość kind='location' (walidacja Zodem co serwer). */
	onSave: (input: { lat: number; lng: number; label?: string }) => void;
	/** Anuluj/Escape → zamyka formularz bez wysyłania. */
	onCancel: () => void;
	/** Wysyłka w toku — blokuje przycisk (mutation w ChatView). */
	pending?: boolean;
}

/** Start mapy: centrum Polski — odbiorcy to rodzina w PL (PRD #201). */
const POLAND_CENTER: [number, number] = [52.0, 19.5];
const DEFAULT_ZOOM = 5;
/** Zoom po „Użyj mojej lokalizacji" — poziom ulicy. */
const GEO_ZOOM = 15;

/**
 * Map picker `/polozenie` (F3 #216): Leaflet + kafle OpenStreetMap (bez kluczy
 * API i płatnych serwisów — decyzja PRD). Dwa sposoby ustawienia pinezki:
 * klik na mapie lub „Użyj mojej lokalizacji" (Geolocation API). Odmowa zgody /
 * brak wsparcia NIE blokuje — degrade do ręcznego pinowania z komunikatem.
 * Pinezka to divIcon (domyślny PNG Leafleta gubi się pod bundlerem).
 */
export function ChatLocationForm({ onSave, onCancel, pending = false }: ChatLocationFormProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<L.Map | null>(null);
	const markerRef = useRef<L.Marker | null>(null);
	const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
	const [label, setLabel] = useState("");
	const [geoError, setGeoError] = useState<string | null>(null);
	const [locating, setLocating] = useState(false);

	/** Klik/przycisk ustawia albo przesuwa JEDNĄ pinezkę (patch replacement). */
	const placeMarker = useCallback((lat: number, lng: number) => {
		const map = mapRef.current;
		if (!map) return;
		if (markerRef.current) {
			markerRef.current.setLatLng([lat, lng]);
		} else {
			markerRef.current = L.marker([lat, lng], {
				icon: L.divIcon({ className: "chat-map-pin", iconSize: [18, 18], iconAnchor: [9, 9] }),
			}).addTo(map);
		}
		setPin({ lat, lng });
		setGeoError(null);
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const map = L.map(container).setView(POLAND_CENTER, DEFAULT_ZOOM);
		// Prefix „Leaflet" (z flagą) znika — zostaje obowiązkowy © OpenStreetMap
		// (wymóg licencji kafli OSM, decyzja HITL).
		map.attributionControl.setPrefix(false);
		L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			maxZoom: 19,
		}).addTo(map);
		map.on("click", (event: L.LeafletMouseEvent) => {
			placeMarker(event.latlng.lat, event.latlng.lng);
		});
		mapRef.current = map;
		return () => {
			map.remove();
			mapRef.current = null;
			markerRef.current = null;
		};
	}, [placeMarker]);

	/** „Użyj mojej lokalizacji": przyznana zgoda → pinezka skacze na pozycję. */
	function useMyLocation() {
		if (!("geolocation" in navigator)) {
			setGeoError("Przeglądarka nie wspiera lokalizacji — wskaż miejsce na mapie");
			return;
		}
		setLocating(true);
		setGeoError(null);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				setLocating(false);
				const { latitude, longitude } = position.coords;
				mapRef.current?.setView([latitude, longitude], GEO_ZOOM);
				placeMarker(latitude, longitude);
			},
			() => {
				// Odmowa zgody / brak sygnału — ręczne pinowanie nadal działa (AC #216).
				setLocating(false);
				setGeoError("Nie udało się pobrać lokalizacji — wskaż miejsce na mapie");
			},
			{ timeout: 10_000 },
		);
	}

	/** Zapis: bez pinezki przycisk jest zablokowany; etykieta opcjonalna (trim). */
	function handleSave() {
		if (!pin) return;
		const trimmed = label.trim();
		onSave({ lat: pin.lat, lng: pin.lng, ...(trimmed ? { label: trimmed } : {}) });
	}

	function handleFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Enter") {
			event.preventDefault();
			handleSave();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		}
	}

	return (
		<div
			data-location-form
			className="mb-2 rounded-xl border border-border bg-popover p-3 shadow-md"
		>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs font-medium text-muted-foreground">Wskaż miejsce na mapie</p>
					<button
						type="button"
						onClick={useMyLocation}
						disabled={locating}
						className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
					>
						{locating ? (
							// Mały spinner z kropkami (nasz Loader) + „Lokalizowanie…" — HITL.
							<Loader size={1.5} />
						) : (
							<Crosshair className="size-3.5" aria-hidden="true" />
						)}
						{locating ? "Lokalizowanie…" : "Użyj mojej lokalizacji"}
					</button>
				</div>
				<div
					ref={containerRef}
					data-map-container
					className="h-88 w-full overflow-hidden rounded-md border border-input"
				/>
				{geoError ? (
					<p role="alert" className="text-xs text-destructive">
						{geoError}
					</p>
				) : null}
				{pin ? (
					<p data-pin-coords className="text-xs tabular-nums text-muted-foreground">
						{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
					</p>
				) : null}
				<div>
					<label
						htmlFor="chat-location-label"
						className="text-xs font-medium text-muted-foreground"
					>
						Opis (opcjonalnie)
					</label>
					<input
						id="chat-location-label"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onKeyDown={handleFieldKeyDown}
						maxLength={200}
						placeholder="…"
						className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						Anuluj
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!pin || pending}
						className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					>
						<MapPin className="size-4" aria-hidden="true" />
						{pending ? "Wysyłanie…" : "Wyślij"}
					</button>
				</div>
			</div>
		</div>
	);
}
