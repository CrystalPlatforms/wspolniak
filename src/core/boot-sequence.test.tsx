// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED):
 * - Kolejność etapów: etap widoczny ⟺ on i wszystkie wcześniejsze gotowe (czysta reguła).
 * - Zero sztucznych opóźnień: brak timerów między etapami — flip sygnału bramy
 *   odsłania etapy w tym samym renderze.
 * - Cold/warm: przed osiadnięciem pasków (useBootSettled=false) treść czeka na szkieletach;
 *   po (warm/nawigacja kliencka) wszystko widoczne od razu, choreografia się nie odtwarza.
 * - `useBootSettled` mockujemy jako granicę czasu (zegar systemowy); jego logika
 *   ma własne testy w boot-splash.test.tsx.
 */
import { render, screen } from "@testing-library/react";
import { revealStages, useBootSequence } from "./boot-sequence";
import { useBootSettled } from "./boot-splash";

vi.mock("./boot-splash", () => ({
	useBootSettled: vi.fn(),
}));

const FEED_STAGES = ["text", "reactions", "photos"] as const;

describe("revealStages", () => {
	it("wymusza kolejność: reakcje gotowe, ale tekst nie → reakcje ukryte", () => {
		const visible = revealStages(FEED_STAGES, {
			text: false,
			reactions: true,
			photos: false,
		});
		expect(visible).toEqual({ text: false, reactions: false, photos: false });
	});

	it("wiszący zasób (photos) nie blokuje wcześniejszych etapów", () => {
		const visible = revealStages(FEED_STAGES, {
			text: true,
			reactions: true,
			photos: false,
		});
		expect(visible).toEqual({ text: true, reactions: true, photos: false });
	});

	it("wszystko gotowe → wszystko widoczne w jednym wywołaniu (zero opóźnień)", () => {
		const visible = revealStages(FEED_STAGES, {
			text: true,
			reactions: true,
			photos: true,
		});
		expect(visible).toEqual({ text: true, reactions: true, photos: true });
	});

	it("gotowość w odwrotnej kolejności (photos pierwsze) → kolejność nadal wymuszona", () => {
		const visible = revealStages(FEED_STAGES, {
			text: false,
			reactions: false,
			photos: true,
		});
		expect(visible).toEqual({ text: false, reactions: false, photos: false });
	});
});

describe("useBootSequence", () => {
	const mockedSettled = vi.mocked(useBootSettled);

	function SequenceProbe({
		stages,
		ready,
	}: {
		stages: readonly string[];
		ready: Record<string, boolean>;
	}) {
		const visible = useBootSequence(stages, ready);
		return <div data-testid="seq">{JSON.stringify(visible)}</div>;
	}

	function readSeq(): Record<string, boolean> {
		return JSON.parse(screen.getByTestId("seq").textContent ?? "{}");
	}

	beforeEach(() => {
		mockedSettled.mockReset();
	});

	it("zimny start (przed osiadnięciem pasków): wszystko ukryte mimo gotowych danych", () => {
		mockedSettled.mockReturnValue(false);
		render(
			<SequenceProbe stages={FEED_STAGES} ready={{ text: true, reactions: true, photos: true }} />,
		);
		expect(readSeq()).toEqual({ text: false, reactions: false, photos: false });
	});

	it("warm (osiadnięcie przed montażem): wszystko widoczne natychmiast", () => {
		mockedSettled.mockReturnValue(true);
		render(
			<SequenceProbe stages={FEED_STAGES} ready={{ text: true, reactions: true, photos: true }} />,
		);
		expect(readSeq()).toEqual({ text: true, reactions: true, photos: true });
	});

	it("flip sygnału false→true odsłania etapy w tym samym renderze — zero timerów", () => {
		mockedSettled.mockReturnValue(false);
		const ready = { text: true, reactions: true, photos: false };
		const { rerender } = render(<SequenceProbe stages={FEED_STAGES} ready={ready} />);
		expect(readSeq().text).toBe(false);

		mockedSettled.mockReturnValue(true);
		rerender(<SequenceProbe stages={FEED_STAGES} ready={ready} />);
		expect(readSeq()).toEqual({ text: true, reactions: true, photos: false });
	});

	it("wymusza kolejność także przez hook: reactions nie wyprzedzi text", () => {
		mockedSettled.mockReturnValue(true);
		render(
			<SequenceProbe
				stages={FEED_STAGES}
				ready={{ text: false, reactions: true, photos: false }}
			/>,
		);
		expect(readSeq()).toEqual({ text: false, reactions: false, photos: false });
	});
});
