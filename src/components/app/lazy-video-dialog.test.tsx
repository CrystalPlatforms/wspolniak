// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * TDD #247 — założenia:
 * - LazyVideoDialog ma identyczny interfejs publiczny jak VideoDialog
 *   ({ video, onClose }); chunk (Radix Dialog + YoutubePostPlayer) pobiera się
 *   DOPERO przy pierwszym otwarciu (mount-on-open), nie przy montażu karty.
 * - video=null → komponent renderuje NIC (chunk nie startuje).
 * - Po otwarciu: czarna tarcza (fallback Suspense) póki chunk się ładuje →
 *   treść dialogu. Import modułu dialogu bramkujemy (vi.mock z async fabryką),
 *   żeby tarcza była deterministyczna, a nie wyścig z szybkim importem.
 * - Fallback nie jest prawdziwym dialogiem (bez ESC na ten moment) — akceptowany
 *   kompromis na czas pobrania chunku (<1 s na typowym łączu).
 */
import { act, render, screen } from "@testing-library/react";
import { LazyVideoDialog } from "./lazy-video-dialog";

const { gate } = vi.hoisted(() => {
	let resolveGate!: () => void;
	const promise = new Promise<void>((resolve) => {
		resolveGate = resolve;
	});
	return { gate: { promise, resolve: resolveGate } };
});

vi.mock("./video-player-dialog", async () => {
	await gate.promise;
	return {
		// Marker treści „z chunku" — odróżnia mockowany moduł od fallbacku.
		VideoDialog: ({ video }: { video: { title: string } }) => (
			<div>dialog-z-chunku {video.title}</div>
		),
	};
});

const VIDEO = {
	youtubeVideoId: "abc123",
	title: "Testowy film",
	thumbnailUrl: "/thumb.jpg",
};

describe("LazyVideoDialog", () => {
	it("zamknięty (video=null) renderuje nic — chunk nie startuje", () => {
		const { container } = render(<LazyVideoDialog video={null} onClose={() => {}} />);
		expect(container.innerHTML).toBe("");
	});

	it("otwarcie: tarcza na czas chunku, po nim treść dialogu", async () => {
		const { container } = render(<LazyVideoDialog video={VIDEO} onClose={() => {}} />);

		// Import jest zablokowany bramką — tarcza MUSI być w DOM (deterministycznie)
		expect(screen.getByTestId("video-dialog-loading")).toBeTruthy();
		expect(container.innerHTML).not.toBe("");

		act(() => {
			gate.resolve();
		});

		// Po rozwiązaniu chunku — treść, tarcza zniknęła
		expect(await screen.findByText("dialog-z-chunku Testowy film")).toBeTruthy();
		expect(screen.queryByTestId("video-dialog-loading")).toBeNull();
	});
});
