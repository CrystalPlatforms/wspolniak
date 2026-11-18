// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED):
 * - REVIZA (zero sztucznych czekań): SPLASH_MIN_MS = 0 i BOOT_SLIDE_MS = 0 —
 *   splash znika w chwili hydratacji, treść nie czeka na osiadnięcie pasków.
 * - Splash wygląda 1:1 jak ładujący się feed (PostCardSkeleton na tle aplikacji).
 * - Splash jest całodokumentowy (shell HTML), stan modułu przeżywa remounty
 *   (error boundary nie przywraca splasha).
 * - `useBootReveal` odblokowuje choreografię pasków w chwili ukrycia splasha.
 * - Offline fast-path (#148): boot przy navigator.onLine=false omija timery —
 *   cache'owany feed ma być widoczny natychmiast.
 * - NIE testujemy tu: okablowania pasków/klas CSS (HITL), wyglądu.
 */
import { act, render, screen } from "@testing-library/react";
import { BootSplashContent, SPLASH_MIN_MS, splashRemainingMs } from "./boot-splash";

/** Stan bootu jest singletonem modułu — testy cyklu życia potrzebują świeżej kopii. */
async function freshBootSplash() {
	vi.resetModules();
	return import("./boot-splash");
}

describe("boot splash", () => {
	describe("splashRemainingMs", () => {
		it("zawsze zwraca 0 — brak sztucznego minimum czekania", () => {
			expect(splashRemainingMs(200)).toBe(0);
			expect(splashRemainingMs(SPLASH_MIN_MS)).toBe(0);
			expect(splashRemainingMs(1500)).toBe(0);
		});
	});

	describe("BootSplash", () => {
		it("statyczny markup 1:1 jak ładujący się feed (bez tytułu i loadera)", () => {
			// Markup przez BootSplashContent: przy SPLASH_MIN_MS = 0 BootSplash znika
			// już w pierwszym efekcie, więc mount nie pokaże statycznej treści.
			const { container } = render(<BootSplashContent />);

			expect(container.querySelector(".boot-splash")).not.toBeNull();
			// Karty szkieletu jak w feedzie — trzy na kolumnę (feed dokłada resztę).
			const cards = container.querySelectorAll(".boot-splash-skeleton article");
			expect(cards.length).toBe(3);
			// Reviza: ani zielonego loadera (uib-dot-loader), ani tytułu na tle aplikacji.
			expect(container.querySelector(".uib-dot")).toBeNull();
			expect(container.querySelector(".boot-splash-title")).toBeNull();
		});

		it("pokazuje powitanie Witaj + imię z sesji w nagłówku splasha", () => {
			const { container, getByText } = render(<BootSplashContent name="Tomek" />);

			expect(getByText(/^Witaj Tomek$/)).not.toBeNull();
			// Powitanie nie może być aria-hidden (to treść, nie dekoracja).
			expect(getByText(/^Witaj Tomek$/).closest("[aria-hidden='true']")).toBeNull();
			// Karty zostają dekoracyjne.
			expect(
				container.querySelector(".boot-splash-skeleton article")?.getAttribute("aria-hidden"),
			).toBe("true");
		});

		it("bez imienia nie renderuje nagłówka powitania", () => {
			const { container, queryByText } = render(<BootSplashContent />);

			expect(queryByText(/^Witaj/)).toBeNull();
			expect(container.querySelectorAll(".boot-splash-skeleton article").length).toBe(3);
		});

		it("znika od razu po hydratacji — zero czekania niezależnie od zegara", async () => {
			const { BootSplash: FreshSplash } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(200);
			try {
				const { container } = render(<FreshSplash />);
				// Bez advanceTimers — efekt ujawnia natychmiast (SPLASH_MIN_MS = 0).
				expect(container.querySelector(".boot-splash")).toBeNull();
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
				const { unmount, container } = render(<FreshSplash />);
				unmount();

				const second = render(<FreshSplash />);
				expect(second.container.querySelector(".boot-splash")).toBeNull();
				expect(container).toBeDefined();
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

		it("zwraca true od razu po montażu — zero czekania", async () => {
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

		it("true od razu — treść nie czeka na osiadnięcie pasków (BOOT_SLIDE_MS = 0)", async () => {
			const { BootSplash: FreshSplash, useBootSettled } = await freshBootSplash();
			vi.useFakeTimers({ now: 0 });
			const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => Date.now());
			try {
				render(
					<>
						<FreshSplash />
						<SettledProbe useSettled={useBootSettled} />
					</>,
				);

				expect(screen.getByTestId("settled").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("późny montaż po osiadnięciu dostaje true od razu", async () => {
			const { BootSplash: FreshSplash, useBootSettled } = await freshBootSplash();
			vi.useFakeTimers({ now: 0 });
			const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => Date.now());
			try {
				render(<FreshSplash />);
				act(() => vi.advanceTimersByTime(0));

				render(<SettledProbe useSettled={useBootSettled} />);
				expect(screen.getByTestId("settled").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});
	});

	describe("offline fast-path (#148)", () => {
		function RevealProbe({ useReveal }: { useReveal: () => boolean }) {
			const revealed = useReveal();
			return <div data-testid="reveal">{revealed ? "true" : "false"}</div>;
		}

		function SettledProbeLocal({ useSettled }: { useSettled: () => boolean }) {
			const settled = useSettled();
			return <div data-testid="settled">{settled ? "true" : "false"}</div>;
		}

		function setOnline(value: boolean) {
			Object.defineProperty(navigator, "onLine", { value, configurable: true });
		}

		afterEach(() => {
			setOnline(true);
		});

		it("splash znika natychmiast — bez czekania na jakiekolwiek timery", async () => {
			setOnline(false);
			const { BootSplash: FreshSplash } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(100);
			try {
				const { container } = render(<FreshSplash />);

				// Zero advanceTimers — ukrycie w tej samej ticki efektu.
				expect(container.querySelector(".boot-splash")).toBeNull();
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("useBootReveal zwraca true natychmiast — paski nie czekają na splash", async () => {
			setOnline(false);
			const { BootSplash: FreshSplash, useBootReveal } = await freshBootSplash();
			vi.useFakeTimers();
			const nowSpy = vi.spyOn(performance, "now").mockReturnValue(100);
			try {
				render(
					<>
						<FreshSplash />
						<RevealProbe useReveal={useBootReveal} />
					</>,
				);

				expect(screen.getByTestId("reveal").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});

		it("useBootSettled zwraca true natychmiast — choreografia treści się nie odtwarza", async () => {
			setOnline(false);
			const { BootSplash: FreshSplash, useBootSettled } = await freshBootSplash();
			vi.useFakeTimers({ now: 0 });
			const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => Date.now());
			try {
				render(
					<>
						<FreshSplash />
						<SettledProbeLocal useSettled={useBootSettled} />
					</>,
				);

				expect(screen.getByTestId("settled").textContent).toBe("true");
			} finally {
				nowSpy.mockRestore();
				vi.useRealTimers();
			}
		});
	});
});
