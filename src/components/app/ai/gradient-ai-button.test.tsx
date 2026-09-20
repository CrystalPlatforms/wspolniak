// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#189):
// - Widoczność = useAiAccess().data?.effective === true (wzorem wejść do czatu);
//   w trakcie ładowania stanu dostępu i przy błędzie przycisk jest ukryty.
// - Przycisk pojawia się dopiero, gdy pole ma treść (po trim).
// - Klik → POST /api/ai/generate { mode: "improve-post-description", text };
//   sukces { data: { text } } → onResult(poprawiony); błąd { error } (PL)
//   lub upadek sieci → inline komunikat po polsku, onResult NIE wołany.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";
import { shrinkImageToLimit } from "@/images/shrink";
import { GradientAiButton } from "./gradient-ai-button";

vi.mock("@/images/shrink", () => ({ shrinkImageToLimit: vi.fn() }));

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

/** fetch mock na granicy systemu: GET /access → stan dostępu; POST /generate → wynik. */
function mockFetch(opts: {
	effective?: boolean;
	hangAccess?: boolean;
	generate?: { ok: boolean; status: number; body: unknown };
}) {
	return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (url.includes("/api/ai/access")) {
			if (opts.hangAccess) return new Promise(() => {});
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: { master: true, aiOptIn: true, aiBlocked: false, effective: opts.effective },
					}),
			});
		}
		if (init?.method === "POST" && url.includes("/api/ai/generate")) {
			const g = opts.generate ?? { ok: true, status: 200, body: { data: { text: "Lepszy opis" } } };
			return Promise.resolve({
				ok: g.ok,
				status: g.status,
				json: () => Promise.resolve(g.body),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
	});
}

function renderButton(props: Partial<Parameters<typeof GradientAiButton>[0]> = {}) {
	return render(<GradientAiButton text="Mój opis" onResult={vi.fn()} {...props} />, {
		wrapper: createWrapper(),
	});
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("GradientAiButton", () => {
	const FILE = new File(["foto"], "foto.jpg", { type: "image/jpeg" });
	const onResult = vi.fn();
	it("nie renderuje się bez skutecznego dostępu do AL", async () => {
		vi.stubGlobal("fetch", mockFetch({ effective: false }));

		const { container } = renderButton();

		// Czekamy na wynik zapytania o dostęp — przycisku nadal nie ma.
		await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
		expect(container.childElementCount).toBe(0);
	});

	it("nie renderuje się, dopóki stan dostępu jest nieznany (ładowanie)", async () => {
		vi.stubGlobal("fetch", mockFetch({ hangAccess: true }));

		const { container } = renderButton();

		// Zapytanie wisí — brak danych o dostępie = przycisk ukryty (nie „czekaj").
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(container.childElementCount).toBe(0);
	});

	it("przy pustym polu: Popraw opis widoczny, ale WYGASZONY (F3 HITL)", async () => {
		vi.stubGlobal("fetch", mockFetch({ effective: true }));
		renderButton({ text: "   " });

		const button = await screen.findByRole("button", { name: /popraw opis/i });
		expect(button.hasAttribute("disabled")).toBe(true);
	});

	it("renderuje się przy skutecznym dostępie i treści w polu", async () => {
		vi.stubGlobal("fetch", mockFetch({ effective: true }));

		renderButton({ text: "Mój opis" });

		expect(await screen.findByRole("button", { name: /popraw opis/i })).toBeDefined();
	});

	it("po kliknięciu pokazuje busy, a poprawiony tekst trafia do onResult", async () => {
		const user = userEvent.setup();
		const onResult = vi.fn();
		const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (init?.method === "POST" && url.includes("/api/ai/generate")) {
				return new Promise((resolve) =>
					setTimeout(
						() =>
							resolve({
								ok: true,
								status: 200,
								json: () => Promise.resolve({ data: { text: "Lepszy opis" } }),
							}),
						50,
					),
				);
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: { master: true, aiOptIn: true, aiBlocked: false, effective: true },
					}),
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		renderButton({ onResult });
		const button = await screen.findByRole("button", { name: /popraw opis/i });
		await user.click(button);

		// W trakcie: busy — wyłączony, etykieta „Poprawiam…".
		const busy = screen.getByRole("button", { name: /poprawiam/i });
		expect(busy.hasAttribute("disabled")).toBe(true);

		// Po sukcesie: poprawiony tekst ląduje w onResult, przycisk wraca do idle.
		await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith("Lepszy opis"));
		await vi.waitFor(() => {
			const idle = screen.getByRole("button", { name: /popraw opis/i });
			expect(idle.hasAttribute("disabled")).toBe(false);
		});
		// Payload: właściwy mode i aktualny tekst.
		const generateCall = fetchMock.mock.calls.find(
			([url, init]) => init?.method === "POST" && String(url).includes("/api/ai/generate"),
		);
		expect(JSON.parse(generateCall?.[1]?.body as string)).toEqual({
			mode: "improve-post-description",
			text: "Mój opis",
		});
	});

	it("błąd endpointa → polski komunikat inline, treść nietknięta", async () => {
		const user = userEvent.setup();
		const onResult = vi.fn();
		vi.stubGlobal(
			"fetch",
			mockFetch({
				effective: true,
				generate: {
					ok: false,
					status: 502,
					body: { error: "AL ma teraz problemy techniczne. Spróbuj ponownie za chwilę." },
				},
			}),
		);

		renderButton({ onResult });
		await user.click(await screen.findByRole("button", { name: /popraw opis/i }));

		// Inline alert z polskim komunikatem z endpointu…
		expect((await screen.findByRole("alert")).textContent).toContain(
			"AL ma teraz problemy techniczne. Spróbuj ponownie za chwilę.",
		);
		// …treść pola nietknięta (onResult nie wołany), przycisk znów aktywny.
		expect(onResult).not.toHaveBeenCalled();
		await vi.waitFor(() =>
			expect(screen.getByRole("button", { name: /popraw opis/i }).hasAttribute("disabled")).toBe(
				false,
			),
		);
	});

	it("upadek sieci → ogólny polski komunikat", async () => {
		const user = userEvent.setup();
		const onResult = vi.fn();
		vi.stubGlobal("fetch", mockFetch({ effective: true }));
		const realFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (init?.method === "POST") return Promise.reject(new Error("network down"));
			return realFetch(url as string, init);
		});

		renderButton({ onResult });
		await user.click(await screen.findByRole("button", { name: /popraw opis/i }));

		expect((await screen.findByRole("alert")).textContent).toContain(
			"Nie udało się poprawić opisu. Spróbuj ponownie.",
		);
		expect(onResult).not.toHaveBeenCalled();
	});

	const PROPOSE_DEFAULTS = { text: "", file: FILE, onResult };

	it("zdjęcie + puste pole: oba widoczne — Zaproponuj aktywny, Popraw wygaszony", async () => {
		vi.stubGlobal("fetch", mockFetch({ effective: true }));
		renderButton(PROPOSE_DEFAULTS);

		const propose = await screen.findByRole("button", { name: /zaproponuj opis/i });
		expect(propose.hasAttribute("disabled")).toBe(false);
		const improve = screen.getByRole("button", { name: /popraw opis/i });
		expect(improve.hasAttribute("disabled")).toBe(true);
	});
	it("respektuje zewnętrzne wyłączenie (disabled)", async () => {
		vi.stubGlobal("fetch", mockFetch({ effective: true }));

		renderButton({ disabled: true });

		const button = await screen.findByRole("button", { name: /popraw opis/i });
		expect(button.hasAttribute("disabled")).toBe(true);
	});

	it("bez zdjęcia: Zaproponuj widoczny, ale WYGASZONY", async () => {
		vi.stubGlobal("fetch", mockFetch({ effective: true }));
		renderButton({ text: "", file: null, onResult });
		const propose = await screen.findByRole("button", { name: /zaproponuj opis/i });
		expect(propose.hasAttribute("disabled")).toBe(true);
	});
	it("treść w polu: Zaproponuj WYGASZONY, Popraw aktywny", async () => {
		vi.stubGlobal("fetch", mockFetch({ effective: true }));
		renderButton({ text: "Coś już jest", file: FILE, onResult });
		const propose = await screen.findByRole("button", { name: /zaproponuj opis/i });
		expect(propose.hasAttribute("disabled")).toBe(true);
		const improve = screen.getByRole("button", { name: /popraw opis/i });
		expect(improve.hasAttribute("disabled")).toBe(false);
	});
	it("klik → POST propose z data URL, wynik trafia do onResult", async () => {
		onResult.mockClear();
		const user = userEvent.setup();
		const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (init?.method === "POST" && url.includes("/api/ai/generate")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ data: { text: "Zdjęcie pokazuje ogród." } }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: { master: true, aiOptIn: true, aiBlocked: false, effective: true },
					}),
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		renderButton(PROPOSE_DEFAULTS);
		await user.click(await screen.findByRole("button", { name: /zaproponuj opis/i }));
		await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith("Zdjęcie pokazuje ogród."));
		const call = fetchMock.mock.calls.find(
			([u, i]) => i?.method === "POST" && String(u).includes("/api/ai/generate"),
		);
		const body = JSON.parse(call?.[1]?.body as string) as { mode: string; image: string };
		expect(body.mode).toBe("propose-post-description");
		expect(body.image).toMatch(/^data:image\//);
	});
	it("błąd endpointa w propose → polski alert, onResult nietknięty", async () => {
		onResult.mockClear();
		const user = userEvent.setup();
		vi.stubGlobal(
			"fetch",
			mockFetch({
				effective: true,
				generate: {
					ok: false,
					status: 502,
					body: { error: "Limit został osiągnięty, zaczekaj chwilę." },
				},
			}),
		);
		renderButton(PROPOSE_DEFAULTS);
		await user.click(await screen.findByRole("button", { name: /zaproponuj opis/i }));
		expect((await screen.findByRole("alert")).textContent).toContain("Limit został osiągnięty");
		expect(onResult).not.toHaveBeenCalled();
	});
	it("duże zdjęcie → pomniejszone przez shrink przed POST", async () => {
		const user = userEvent.setup();
		const BIG_FILE = new File(["x".repeat(3_000_001)], "big.jpg", { type: "image/jpeg" });
		const SHRUNK = new File(["mały"], "big.jpg", { type: "image/jpeg" });

		vi.mocked(shrinkImageToLimit).mockClear();
		vi.mocked(shrinkImageToLimit).mockResolvedValue(SHRUNK);
		vi.stubGlobal("fetch", mockFetch({ effective: true }));
		renderButton({ text: "", file: BIG_FILE, onResult });
		await user.click(await screen.findByRole("button", { name: /zaproponuj opis/i }));
		await vi.waitFor(() => expect(vi.mocked(shrinkImageToLimit)).toHaveBeenCalled());
		await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
	});
});
