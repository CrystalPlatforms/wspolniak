// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconCrosshair } from "@tabler/icons-react";
import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ui/loader";
import "leaflet/dist/leaflet.css";

interface PostLocationPickerValue {
	lat: number;
	lng: number;
}

interface PostLocationPickerProps {
	value: PostLocationPickerValue | null;
	onChange: (value: PostLocationPickerValue | null) => void;
}

/** Start mapy: centrum Polski — odbiorcy to rodzina w PL (PRD #240). */
const POLAND_CENTER: [number, number] = [52.0, 19.5];
const DEFAULT_ZOOM = 5;
/** Zoom po "Użyj mojej lokalizacji" — poziom ulicy. */
const GEO_ZOOM = 15;

/**
 * Map picker postów (#242): Leaflet + kafle OpenStreetMap, bez kluczy API.
 * Dwa sposoby ustawienia pinezki: klik na mapie albo przycisk GPS. Odmowa
 * dostępu do lokalizacji NIE jest error-wallem: komunikat znika, gdy user
 * pinuje ręcznie. Komponent jest lazy (chunk leaflet leci tylko gdy sekcja
 * lokalizacji jest otwarta).
 */
export default function PostLocationPicker({ value, onChange }: PostLocationPickerProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<L.Map | null>(null);
	const markerRef = useRef<L.Marker | null>(null);
	const [geoError, setGeoError] = useState<string | null>(null);
	const [locating, setLocating] = useState(false);
	// Refy utrzymują placeMarker i efekt stabilnymi: mapa montuje się dokładnie raz,
	// a zmieniające się propsy (onChange, value startowe) są czytane przez ref.
	const onChangeRef = useRef(onChange);
	const initialValueRef = useRef(value);
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	/** Klik/GPS ustawia albo przesuwa JEDNĄ pinezkę. */
	const placeMarker = useCallback((lat: number, lng: number) => {
		const map = mapRef.current;
		if (!map) return;
		if (markerRef.current) {
			markerRef.current.setLatLng([lat, lng]);
		} else {
			markerRef.current = L.marker([lat, lng], {
				// divIcon z wbudowanym stylem — domyślny PNG Leafleta gubi się pod bundlerem.
				icon: L.divIcon({
					className: "",
					html: '<div style="width:18px;height:18px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
					iconSize: [18, 18],
					iconAnchor: [9, 9],
				}),
			}).addTo(map);
		}
		onChangeRef.current({ lat, lng });
		setGeoError(null);
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const map = L.map(container).setView(POLAND_CENTER, DEFAULT_ZOOM);
		// Prefix "Leaflet" (z flagą) znika — zostaje obowiązkowy (c) OpenStreetMap.
		map.attributionControl.setPrefix(false);
		L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
			attribution: '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			maxZoom: 19,
		}).addTo(map);
		map.on("click", (event: L.LeafletMouseEvent) => {
			placeMarker(event.latlng.lat, event.latlng.lng);
		});
		// ref ustawiam PRZED przywróceniem pinezki (placeMarker czyta mapRef).
		mapRef.current = map;
		// Przywróć pinezkę z zapisanej lokalizacji (edycja posta) — tylko przy montażu.
		const initial = initialValueRef.current;
		if (initial) {
			map.setView([initial.lat, initial.lng], GEO_ZOOM);
			placeMarker(initial.lat, initial.lng);
		}
		return () => {
			map.remove();
			mapRef.current = null;
			markerRef.current = null;
		};
	}, [placeMarker]);

	function useMyLocation() {
		if (!("geolocation" in navigator)) {
			setGeoError("Ta przeglądarka nie obsługuje lokalizacji. Wskaż miejsce na mapie.");
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
				// Odmowa zgody / brak sygnału: user pinuje ręcznie, bez error-wall.
				setLocating(false);
				setGeoError("Nie udało się pobrać Twojej pozycji. Wskaż miejsce na mapie.");
			},
			{ timeout: 10_000 },
		);
	}

	return (
		<div data-post-location-picker className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs font-medium text-muted-foreground">Wskaż miejsce na mapie</p>
				<button
					type="button"
					onClick={useMyLocation}
					disabled={locating}
					className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
				>
					{locating ? (
						<Loader size={1.5} />
					) : (
						<IconCrosshair className="size-3.5" aria-hidden="true" />
					)}
					{locating ? "Lokalizowanie…" : "Moja pozycja"}
				</button>
			</div>
			<div
				ref={containerRef}
				data-map-container
				className="h-64 w-full overflow-hidden rounded-md border border-input"
			/>
			{geoError ? (
				<p role="alert" className="text-xs text-destructive">
					{geoError}
				</p>
			) : null}
			{value ? (
				<p data-pin-coords className="text-xs tabular-nums text-muted-foreground">
					{value.lat.toFixed(5)}, {value.lng.toFixed(5)}
				</p>
			) : null}
		</div>
	);
}
