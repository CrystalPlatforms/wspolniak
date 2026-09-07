// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (Video v2 #194): hook pokazuje toast DOKŁADNIE RAZ na
// flagę ?videoPublished=1 i natychmiast ją czyści (navigate replace) —
// dzięki temu refresh/refetch nigdy nie powtórzy komunikatu. Guard ref
// chroni też przed podwójnym efektem w React StrictMode (dev).

import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import {
	useVideoPublishedToast,
	VIDEO_PUBLISHED_TOAST,
	VIDEO_PUBLISHED_TOAST_OPTIONS,
} from "./use-video-published-toast";

const mockNavigate = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn() },
}));

import { toast } from "sonner";

describe("useVideoPublishedToast", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows the toast exactly once (also under StrictMode): from the top, black with a thin green border, 7s", () => {
		const { rerender } = renderHook(() => useVideoPublishedToast(true), {
			wrapper: StrictMode,
		});

		expect(toast.success).toHaveBeenCalledExactlyOnceWith(
			VIDEO_PUBLISHED_TOAST,
			VIDEO_PUBLISHED_TOAST_OPTIONS,
		);
		// Reviza usera: od góry (top-center), czarne tło, cienkie (1px) zielone
		// (primary) obramowanie.
		expect(VIDEO_PUBLISHED_TOAST_OPTIONS.position).toBe("top-center");
		expect(VIDEO_PUBLISHED_TOAST_OPTIONS.duration).toBe(7000);
		expect(VIDEO_PUBLISHED_TOAST_OPTIONS.style).toEqual({
			backgroundColor: "#000000",
			color: "#ffffff",
			border: "1px solid var(--primary)",
		});
		expect(mockNavigate).toHaveBeenCalledExactlyOnceWith({
			to: "/app",
			search: { videoPublished: undefined },
			replace: true,
		});

		// Re-render z wyczyszczoną flagą → zero dodatkowych toastów.
		rerender();
		expect(toast.success).toHaveBeenCalledTimes(1);
	});

	it("does nothing without the flag (regular feed arrival)", () => {
		renderHook(() => useVideoPublishedToast(undefined));

		expect(toast.success).not.toHaveBeenCalled();
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
