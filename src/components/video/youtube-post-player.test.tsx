// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (Video v2 F4 #198): IFrame API jest granicą systemową —
// test podstawia fake `window.YT` i steruje zdarzeniami ręcznie.
// Sprawdzane minimalnie: klik→play/pause toggle, ended→zamrożenie ostatniej
// klatki + „Odtwórz ponownie" (restart od zera), fullscreen na wrapperze.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { YoutubePostPlayer } from "./youtube-post-player";

const fakePlayer = {
	playVideo: vi.fn(),
	pauseVideo: vi.fn(),
	seekTo: vi.fn(),
	getCurrentTime: vi.fn(() => 0),
	getDuration: vi.fn(() => 100),
	getPlayerState: vi.fn(() => 1), // playing
	destroy: vi.fn(),
};
type PlayerOptions = {
	videoId: string;
	playerVars?: Record<string, string | number>;
	events?: {
		onReady?: () => void;
		onStateChange?: (event: { data: number }) => void;
	};
};

function capturedOptions(): PlayerOptions {
	const playerMock = window.YT?.Player as unknown as {
		mock: { calls: [HTMLElement, PlayerOptions][] };
	};
	const call = playerMock?.mock?.calls?.[0];
	if (!call) throw new Error("YT.Player nie został wywołany");
	return call[1];
}

beforeEach(() => {
	vi.clearAllMocks();
	// Uwaga: implementation MUSI być `function`, nie arrow — komponent woła
	// `new YT.Player(...)`, a arrow nie jest konstruktorem (vitest 4 rzuca).
	window.YT = {
		Player: vi.fn(function PlayerMock(this: unknown) {
			return fakePlayer;
		}),
	} as unknown as typeof window.YT;
	// Symuluj przeglądarkę z Fullscreen API (desktop/Android/iOS 16.4+).
	Object.defineProperty(Element.prototype, "requestFullscreen", {
		configurable: true,
		value: vi.fn().mockResolvedValue(undefined),
	});
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		value: null,
	});
});

afterEach(() => {
	delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
	delete (document as { fullscreenElement?: unknown }).fullscreenElement;
});

describe("YoutubePostPlayer (F4 #198)", () => {
	it("click on the poster starts playback via YT API with related videos off", async () => {
		render(
			<YoutubePostPlayer
				youtubeVideoId="abc123"
				title="Klip"
				thumbnailUrl="https://i.ytimg.com/vi/abc123/hq.jpg"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /odtwórz wideo klip/i }));

		await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());
		expect(capturedOptions().videoId).toBe("abc123");
		// Related tiles wyłączone na poziomie embeda; własny chrome bez paska YT.
		expect(capturedOptions().playerVars?.rel).toBe(0);
		expect(capturedOptions().playerVars?.controls).toBe(0);

		capturedOptions().events?.onReady?.();
		expect(fakePlayer.playVideo).toHaveBeenCalled();
	});

	it("click toggles play/pause", async () => {
		render(<YoutubePostPlayer youtubeVideoId="abc123" title="Klip" thumbnailUrl="https://t.jpg" />);
		fireEvent.click(screen.getByRole("button", { name: /odtwórz wideo klip/i }));
		await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());
		act(() => {
			capturedOptions().events?.onReady?.();
			// YT raportuje odtwarzanie → overlay przełącza label na „Pauza".
			capturedOptions().events?.onStateChange?.({ data: 1 });
		});

		// Stan = playing (fake zwraca 1) → klik pauzuje.
		fireEvent.click(screen.getByRole("button", { name: /^pauza$/i }));
		expect(fakePlayer.pauseVideo).toHaveBeenCalled();

		// YT raportuje pauzę → overlay wraca do „Odtwórz".
		act(() => {
			capturedOptions().events?.onStateChange?.({ data: 2 });
		});
		// Player raportuje pauzę — toggle czyta getPlayerState przy kliknięciu.
		fakePlayer.getPlayerState.mockReturnValue(2);
		fireEvent.click(screen.getByRole("button", { name: /^odtwórz$/i }));
		expect(fakePlayer.playVideo).toHaveBeenCalledTimes(2); // raz z onReady + raz toggle
	});

	it("on ended: freezes the last frame, shows Play again, replay restarts from zero", async () => {
		render(<YoutubePostPlayer youtubeVideoId="abc123" title="Klip" thumbnailUrl="https://t.jpg" />);
		fireEvent.click(screen.getByRole("button", { name: /odtwórz wideo klip/i }));
		await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());

		act(() => {
			capturedOptions().events?.onStateChange?.({ data: 0 }); // ended
		});

		// Bezpiecznik: seek ~0.3s przed końcem + pauza (żadnych kafelków YT).
		expect(fakePlayer.seekTo).toHaveBeenCalledWith(99.7, true);
		expect(fakePlayer.pauseVideo).toHaveBeenCalled();
		const replay = screen.getByRole("button", { name: /odtwórz ponownie/i });
		expect(replay).toBeDefined();

		fireEvent.click(replay);
		expect(fakePlayer.seekTo).toHaveBeenCalledWith(0, true);
		expect(fakePlayer.playVideo).toHaveBeenCalled();
	});

	it("progress timer freezes the clip ~0.3s before the end (end screen never shows)", async () => {
		vi.useFakeTimers();
		try {
			render(
				<YoutubePostPlayer youtubeVideoId="abc123" title="Klip" thumbnailUrl="https://t.jpg" />,
			);
			fireEvent.click(screen.getByRole("button", { name: /odtwórz wideo klip/i }));
			await act(async () => {
				await Promise.resolve();
			});
			act(() => {
				capturedOptions().events?.onReady?.();
			});
			// 99.9/100 s — w strefie zamrożenia (~0.3s przed końcem).
			fakePlayer.getCurrentTime.mockReturnValue(99.9);
			fakePlayer.getDuration.mockReturnValue(100);
			act(() => {
				vi.advanceTimersByTime(200);
			});

			expect(fakePlayer.seekTo).toHaveBeenCalledWith(99.7, true);
			expect(fakePlayer.pauseVideo).toHaveBeenCalled();
			expect(screen.getByRole("button", { name: /odtwórz ponownie/i })).toBeDefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it("fullscreen: requests system fullscreen, UA confirmation toggles immersive UI", async () => {
		// Player jest kontrolowany — rodzic (VideoDialog) rozszerza się na ekran.
		function Harness() {
			const [expanded, setExpanded] = useState(false);
			return (
				<YoutubePostPlayer
					youtubeVideoId="abc123"
					title="Klip"
					thumbnailUrl="https://t.jpg"
					expanded={expanded}
					onExpandedChange={setExpanded}
				/>
			);
		}
		const { container } = render(<Harness />);
		fireEvent.click(screen.getByRole("button", { name: /odtwórz wideo klip/i }));
		await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());

		// Wejście: żądanie systemowego fullscreen.
		fireEvent.click(screen.getByRole("button", { name: /pełny ekran/i }));
		const requestSpy = (
			Element.prototype as unknown as {
				requestFullscreen: ReturnType<typeof vi.fn>;
			}
		).requestFullscreen;
		expect(requestSpy).toHaveBeenCalledTimes(1);

		// UA potwierdza wejście (zdarzenie fullscreenchange) → tryb immersyjny.
		const wrapper = container.querySelector(".aspect-video") as HTMLElement;
		act(() => {
			Object.defineProperty(document, "fullscreenElement", {
				configurable: true,
				value: wrapper,
			});
			document.dispatchEvent(new Event("fullscreenchange"));
		});
		expect(screen.getAllByRole("button", { name: /zamknij pełny ekran/i }).length).toBeGreaterThan(
			0,
		);

		// Wyjście: UA wraca → tryb immersyjny znika, dialog wraca do okna.
		act(() => {
			Object.defineProperty(document, "fullscreenElement", {
				configurable: true,
				value: null,
			});
			document.dispatchEvent(new Event("fullscreenchange"));
		});
		expect(screen.queryByRole("button", { name: /zamknij pełny ekran/i })).toBeNull();
	});

	// Stary iPhone (brak Fullscreen API): apple'owy fullscreen daje dopiero
	// wbudowany player YT (controls=1); nasz pasek postępu zostaje.
	describe("fallback — stary iPhone bez Fullscreen API", () => {
		beforeEach(() => {
			delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
			delete (Element.prototype as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen;
			vi.stubGlobal(
				"navigator",
				Object.create(navigator, { userAgent: { value: "iPhone; CPU iPhone OS 15_0" } }),
			);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("hides our fullscreen button (apple fullscreen lives in YT controls), keeps the bar", async () => {
			render(
				<YoutubePostPlayer youtubeVideoId="abc123" title="Klip" thumbnailUrl="https://t.jpg" />,
			);
			fireEvent.click(screen.getByRole("button", { name: /odtwórz wideo klip/i }));
			await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());

			expect(capturedOptions().playerVars?.controls).toBe(1);
			expect(screen.queryByRole("button", { name: /pełny ekran/i })).toBeNull();
			expect(screen.getByRole("slider", { name: /postęp wideo/i })).not.toBeNull();
		});
	});
});
