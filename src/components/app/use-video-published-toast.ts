// SPDX-License-Identifier: AGPL-3.0-or-later
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Komunikat o przetwarzaniu HD po publikacji posta z wideo (Video v2 #194). */
export const VIDEO_PUBLISHED_TOAST = "Pełna jakość wideo będzie dostępna za kilka minut";

/** Czas wyświetlania toasta (ms) — spina się z paskiem publikacji (7 s). */
export const VIDEO_PUBLISHED_TOAST_DURATION_MS = 7000;

/**
 * Wygląd i miejsce toasta (reviza usera): wyskakuje OD GÓRY (nad paskiem
 * przeglądarki/menu), czarna plakietka z CIENKIM zielonym obramowaniem
 * (primary motywu) — niezależnie od light/dark. Inline `style` celowo wygrywa
 * z klasami globalnego Toastera (popover/bottom-center).
 */
export const VIDEO_PUBLISHED_TOAST_OPTIONS = {
	duration: VIDEO_PUBLISHED_TOAST_DURATION_MS,
	position: "top-center",
	style: {
		backgroundColor: "#000000",
		color: "#ffffff",
		border: "1px solid var(--primary)",
	},
} as const;

/**
 * Toast „pełna jakość za kilka minut" po powrocie na feed z publikacji posta,
 * który miał wideo (us story 11, #194). Wiszy 7 s — tyle, co pasek publikacji.
 *
 * „Dokładnie raz": kompozytor przekazuje flagę w search parametrze
 * `?videoPublished=1`; hook pokazuje toast i NATYCHMIAST czyści flagę
 * (navigate replace), więc refresh/refetch nie powtórzy komunikatu.
 * Guard `useRef` chroni przed podwójnym odpaleniem efektu w StrictMode
 * (dev) i przy re-renderze zanim search parametr zostanie wyczyszczony.
 */
export function useVideoPublishedToast(videoPublished: boolean | undefined): void {
	const navigate = useNavigate();
	const firedRef = useRef(false);

	useEffect(() => {
		if (!videoPublished || firedRef.current) return;
		firedRef.current = true;
		toast.success(VIDEO_PUBLISHED_TOAST, VIDEO_PUBLISHED_TOAST_OPTIONS);
		navigate({ to: "/app", search: { videoPublished: undefined }, replace: true });
	}, [videoPublished, navigate]);
}
