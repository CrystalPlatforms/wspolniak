// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED):
 * - Min. czas splasha liczy się od STARTU NAWIGACJI (performance.now() przy pierwszym
 *   efekcie klienta ≈ moment hydratacji), nie od pierwszego renderu Reacta.
 * - `splashRemainingMs(elapsed)` zwraca ile milisekund brakuje do SPLASH_MIN_MS;
 *   0 gdy elapsed już przekroczył minimum (zero sztucznych opóźnień).
 * - Splash jest całodokumentowy (shell HTML), stan modułu przeżywa remounty
 *   (error boundary nie przywraca splasha).
 * - `useBootReveal` odblokowuje choreografię pasków dokładnie w chwili ukrycia splasha.
 * - NIE testujemy tu: okablowania pasków/klas CSS (HITL), wyglądu, offline (P6).
 */
import { act, render, screen } from "@testing-library/react";
import { SPLASH_MIN_MS, splashRemainingMs } from "./boot-splash";

/** Stan bootu jest singletonem modułu — testy cyklu życia potrzebują świeżej kopii. */
async function freshBootSplash() {
	vi.resetModules();
	return import("./boot-splash");
}

describe("boot splash", () => {
	describe("splashRemainingMs", () => {
		it("zwraca brakujący czas do minimum, gdy hydratacja przyszła przed 600 ms", () => {
			expect(splashRemainingMs(200)).toBe(400);
		});

		it("zwraca 0 dokładnie na granicy minimum", () => {
			expect(splashRemainingMs(SPLASH_MIN_MS)).toBe(0);
		});

		it("zwraca 0, gdy elapsed przekroczył minimum — natychmiastowe ukrycie", () => {
			expect(splashRemainingMs(1500)).toBe(0);
		});
	});

	describe("BootSplash", () => {
		it("renderuje statyczny markup: tytuł Wspólniak i TailChase (6 kropek)", async () => {
			const { BootSplash: FreshSplash } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(0);
			try {
				const { container } = render(<FreshSplash />);

				expect(screen.getByText("Wspólniak")).toBeTruthy();
				const dots = container.querySelectorAll(".loader .dot");
				expect(dots.length).toBe(6);
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("znika dopiero po upływie min. 600 ms od startu nawigacji", async () => {
			const { BootSplash: FreshSplash } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(200);
			try {
				render(<FreshSplash />);
				expect(screen.getByText("Wspólniak")).toBeTruthy();

				act(() => vi.advanceTimersByTime(399));
				expect(screen.getByText("Wspólniak")).toBeTruthy();

				act(() => vi.advanceTimersByTime(1));
				expect(screen.queryByText("Wspólniak")).toBeNull();
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("znika natychmiast, gdy hydratacja nastąpiła po 600 ms — bez czekania na timery", async () => {
			const { BootSplash: FreshSplash } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(900);
			try {
				render(<FreshSplash />);

				expect(screen.queryByText("Wspólniak")).toBeNull();
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("remount po ukryciu nie przywraca splasha (error boundary)", async () => {
			const { BootSplash: FreshSplash } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(900);
			try {
				const { unmount } = render(<FreshSplash />);
				unmount();

				render(<FreshSplash />);

				expect(screen.queryByText("Wspólniak")).toBeNull();
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});
	});

	describe("useBootReveal", () => {
		function Probe({ useReveal }: { useReveal: () => boolean }) {
			const revealed = useReveal();
			return <div data-testid="reveal">{revealed ? "true" : "false"}</div>;
		}

		it("zwraca false przed ukryciem splasha i true w chwili ukrycia", async () => {
			const { BootSplash: FreshSplash, useBootReveal } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(0);
			try {
				render(
					<>
						<FreshSplash />
						<Probe useReveal={useBootReveal} />
					</>,
				);
				expect(screen.getByTestId("reveal").textContent).toBe("false");

				act(() => vi.advanceTimersByTime(599));
				expect(screen.getByTestId("reveal").textContent).toBe("false");

				act(() => vi.advanceTimersByTime(1));
				expect(screen.getByTestId("reveal").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("późny subskrybent (montaż po ukryciu) dostaje true od razu", async () => {
			const { BootSplash: FreshSplash, useBootReveal } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(700);
			try {
				render(<FreshSplash />);

				render(<Probe useReveal={useBootReveal} />);
				expect(screen.getByTestId("reveal").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});
	});

	describe("useBootSettled", () => {
		function SettledProbe({ useSettled }: { useSettled: () => boolean }) {
			const settled = useSettled();
			return <div data-testid="settled">{settled ? "true" : "false"}</div>;
		}

		it("false w chwili ukrycia splasha, true dopiero po BOOT_SLIDE_MS (wjazd pasków)", async () => {
			const { BootSplash: FreshSplash, useBootSettled, BOOT_SLIDE_MS } = await freshBootSplash();
			vi.useFakeTimers({ now: 0 });
			const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => Date.now());
			try {
				render(
					<>
						<FreshSplash />
						<SettledProbe useSettled={useBootSettled} />
					</>,
				);

				act(() => vi.advanceTimersByTime(SPLASH_MIN_MS));
				expect(screen.getByTestId("settled").textContent).toBe("false");

				act(() => vi.advanceTimersByTime(BOOT_SLIDE_MS - 1));
				expect(screen.getByTestId("settled").textContent).toBe("false");

				act(() => vi.advanceTimersByTime(1));
				expect(screen.getByTestId("settled").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("subskrybent zamontowany między reveal a osiadnięciem dostaje false, potem true", async () => {
			const { BootSplash: FreshSplash, useBootSettled, BOOT_SLIDE_MS } = await freshBootSplash();
			vi.useFakeTimers({ now: 0 });
			const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => Date.now());
			try {
				render(<FreshSplash />);
				act(() => vi.advanceTimersByTime(SPLASH_MIN_MS)); // reveal

				render(<SettledProbe useSettled={useBootSettled} />);
				expect(screen.getByTestId("settled").textContent).toBe("false");

				act(() => vi.advanceTimersByTime(BOOT_SLIDE_MS));
				expect(screen.getByTestId("settled").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("późny montaż po osiadnięciu dostaje true od razu", async () => {
			const { BootSplash: FreshSplash, useBootSettled, BOOT_SLIDE_MS } = await freshBootSplash();
			vi.useFakeTimers({ now: 0 });
			const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => Date.now());
			try {
				render(<FreshSplash />);
				act(() => vi.advanceTimersByTime(SPLASH_MIN_MS + BOOT_SLIDE_MS));

				render(<SettledProbe useSettled={useBootSettled} />);
				expect(screen.getByTestId("settled").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});
	});
});
