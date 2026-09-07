// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (Video v2 F4 #198): IFrame API jest granicą systemową —
// test podstawia fake `window.YT` i steruje zdarzeniami ręcznie.
// Sprawdzane minimalnie: klik→play/pause toggle, ended→zamrożenie ostatniej
// klatki + „Odtwórz ponownie" (restart od zera), fullscreen na wrapperze.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

		// Zamrożenie: seek tuż przed końcem + pauza (żadnych kafelków YT).
		expect(fakePlayer.seekTo).toHaveBeenCalledWith(99.95, true);
		expect(fakePlayer.pauseVideo).toHaveBeenCalled();
		const replay = screen.getByRole("button", { name: /odtwórz ponownie/i });
		expect(replay).toBeDefined();

		fireEvent.click(replay);
		expect(fakePlayer.seekTo).toHaveBeenCalledWith(0, true);
		expect(fakePlayer.playVideo).toHaveBeenCalled();
	});

	it("fullscreen requests fullscreen on the player wrapper", async () => {
		const { container } = render(
			<YoutubePostPlayer youtubeVideoId="abc123" title="Klip" thumbnailUrl="https://t.jpg" />,
		);
		fireEvent.click(screen.getByRole("button", { name: /odtwórz wideo klip/i }));
		await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());

		const wrapper = container.querySelector(".aspect-video") as HTMLElement;
		const fullscreenSpy = vi.fn();
		(wrapper as HTMLElement & { requestFullscreen: () => void }).requestFullscreen = fullscreenSpy;

		fireEvent.click(screen.getByRole("button", { name: /pełny ekran/i }));
		expect(fullscreenSpy).toHaveBeenCalledTimes(1);
	});
});
