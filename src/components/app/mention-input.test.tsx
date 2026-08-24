// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";
import { clampDropdownPosition, type Mention, MentionInput } from "./mention-input";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

function mockFetchUsers(data: Array<{ id: string; name: string }>) {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes("/api/app/users")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
	});
}

/** Rodzic trzymający stan wartości — tak jak comment-section w produkcji. */
function TestHost({
	onMentionsChange,
	currentUserId,
}: {
	onMentionsChange?: (mentions: Mention[]) => void;
	currentUserId?: string;
}) {
	const [value, setValue] = useState("");
	return (
		<MentionInput
			value={value}
			onChange={setValue}
			onMentionsChange={onMentionsChange}
			currentUserId={currentUserId}
		/>
	);
}

describe("MentionInput", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("typing @ with query opens dropdown of matching users", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchUsers([
				{ id: "u2", name: "Ania" },
				{ id: "u3", name: "Andrzej" },
			]),
		);
		const user = userEvent.setup();
		render(<TestHost />, { wrapper: createWrapper() });

		await user.type(screen.getByRole("textbox"), "Hej @An");

		expect(await screen.findByText("Ania")).toBeDefined();
		expect(screen.getByText("Andrzej")).toBeDefined();
	});

	it("clicking a user inserts @name into the field and registers the mention", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const onMentionsChange = vi.fn();
		const user = userEvent.setup();
		render(<TestHost onMentionsChange={onMentionsChange} />, { wrapper: createWrapper() });

		await user.type(screen.getByRole("textbox"), "Hej @An");
		const option = await screen.findByText("Ania");
		await user.click(option);

		const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
		expect(textarea.value).toContain("@Ania");
		expect(onMentionsChange).toHaveBeenCalledWith([
			{ userId: "u2", name: "Ania" } satisfies Mention,
		]);
	});

	it("closes the dropdown on Escape", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const user = userEvent.setup();
		render(<TestHost />, { wrapper: createWrapper() });

		await user.type(screen.getByRole("textbox"), "Hej @An");
		await screen.findByText("Ania");
		await user.type(screen.getByRole("textbox"), "{Escape}");

		expect(screen.queryByText("Ania")).toBeNull();
	});

	it("closes the dropdown when the query is broken by a space", async () => {
		vi.stubGlobal("fetch", mockFetchUsers([{ id: "u2", name: "Ania" }]));
		const user = userEvent.setup();
		render(<TestHost />, { wrapper: createWrapper() });

		await user.type(screen.getByRole("textbox"), "Hej @An");
		await screen.findByText("Ania");
		await user.type(screen.getByRole("textbox"), " ");

		expect(screen.queryByText("Ania")).toBeNull();
	});

	it("excludes the current user from the dropdown (self-mention UX)", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchUsers([
				{ id: "u1", name: "Tomek" },
				{ id: "u2", name: "Ania" },
			]),
		);
		const user = userEvent.setup();
		render(<TestHost currentUserId="u1" />, { wrapper: createWrapper() });

		await user.type(screen.getByRole("textbox"), "@");
		await screen.findByText("Ania");

		expect(screen.queryByText("Tomek")).toBeNull();
	});

	it("keeps the highlighted option visible by scrolling the dropdown container, not the page", async () => {
		vi.stubGlobal(
			"fetch",
			mockFetchUsers(
				Array.from({ length: 8 }, (_, i) => ({ id: `u${i + 1}`, name: `User${i + 1}` })),
			),
		);
		const user = userEvent.setup();
		render(<TestHost />, { wrapper: createWrapper() });

		await user.type(screen.getByRole("textbox"), "@");
		await screen.findByText("User2");

		const list = document.querySelector('ul[aria-label="Wspomnij osobę"]') as HTMLUListElement;
		const items = Array.from(document.querySelectorAll("li"));

		// jsdom nie implementuje geometrii — mockujemy getBoundingClientRect (DOM = granica
		// systemu, jak fetch). Widoczny obszar listy: 0..100px; każdy wiersz: 30px wysokości.
		const rect = (top: number, bottom: number) =>
			({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top }) as DOMRect;
		vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(0, 100));
		for (const [i, li] of items.entries()) {
			vi.spyOn(li, "getBoundingClientRect").mockReturnValue(rect(i * 30, i * 30 + 30));
		}

		// scrollIntoView przewija WSZYSTKICH przodków (w tym stronę/textarea) — to bug #96.
		// Fix: aktywny wiersz nigdy nie woła tej metody; przewija się SAM kontener listy.
		const scrollIntoViewSpies = new Map<Element, ReturnType<typeof vi.fn>>();
		for (const li of items) {
			const spy = vi.fn();
			scrollIntoViewSpies.set(li, spy);
			Object.assign(li, { scrollIntoView: spy });
		}

		// Aktywny wiersz: 0 → 4 (top=120, bottom=150 > 100), czyli poza widokiem listy.
		await user.type(screen.getByRole("textbox"), "{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");

		// Lista przewinęła się sama, żeby aktywny wiersz był widoczny.
		expect(list.scrollTop).toBeGreaterThan(0);
		// Strona się nie przesunęła — żaden <li> nie woła scrollIntoView.
		for (const spy of scrollIntoViewSpies.values()) {
			expect(spy).not.toHaveBeenCalled();
		}
	});
});

// #162: dropdown @mention ma być zawsze w kadrze aplikacji. Testujemy czystą
// regułę pozycji na granicy modułu (clampDropdownPosition) — jsdom nie liczy
// geometrii, a pozycja <ul> jest prostym zastosowaniem tej reguły.
//
// Założenia zakodowane w testach:
// - wejście: współrzędne karety względem pola, prostokąt pola we viewportcie,
//   rozmiar viewportu; wyjście: {top?|bottom?, left} względem pola;
// - „miejsce pod karetą" = ≥ 200px (max-h listy) + marginesy — wtedy lista
//   pod karetą jak dotychczas, inaczej flip nad linię karety (kotwica bottom);
// - left klamrujemy po najgorszej szerokości listy (320px), by prawa krawędź
//   nie wychodziła za ekran; lewa krawędź nigdy przed marginesem viewportu;
// - brak wymiarów (SSR-guard) → dotychczasowa pozycja pod karetą.
describe("clampDropdownPosition (#162)", () => {
	const caret = { top: 40, left: 10, height: 20 };

	it("trzyma dropdown pod kareta, gdy pod spodem jest miejsce", () => {
		const pos = clampDropdownPosition(
			caret,
			{ top: 100, left: 50, height: 80 },
			{ width: 1024, height: 768 },
		);

		expect(pos).toEqual({ top: 64, left: 10 });
		expect(pos.bottom).toBeUndefined();
	});

	it("granicznie: dokladnie 200px miejsca pod kareta zostaje pod nia", () => {
		// 372 = 100 (top pola) + 64 (top listy) + 8 (margines) + 200 (max-h)
		const pos = clampDropdownPosition(
			caret,
			{ top: 100, left: 50, height: 80 },
			{ width: 1024, height: 372 },
		);

		expect(pos.top).toBe(64);
	});

	it("flipuje nad karete, gdy pod nia nie zmiesci sie cala lista", () => {
		const pos = clampDropdownPosition(
			caret,
			{ top: 700, left: 50, height: 80 },
			{ width: 1024, height: 768 },
		);

		expect(pos).toEqual({ bottom: 44, left: 10 });
		expect(pos.top).toBeUndefined();
	});

	it("cofa left przy prawej krawedzi, by lista nie wychodzila za ekran (waska PWA)", () => {
		const pos = clampDropdownPosition(
			{ top: 40, left: 400, height: 20 },
			{ top: 100, left: 20, height: 80 },
			{ width: 500, height: 768 },
		);

		// prawa krawedz listy (left+pole+320) == 500-8
		expect(pos).toEqual({ top: 64, left: 152 });
	});

	it("nie pozwala wyjechac lewa krawedzia listy przed margines viewportu", () => {
		const pos = clampDropdownPosition(
			{ top: 40, left: 0, height: 20 },
			{ top: 100, left: -30, height: 80 },
			{ width: 500, height: 768 },
		);

		// lista zaczyna sie 8px od lewej krawedzi viewportu (-30 + 38)
		expect(pos).toEqual({ top: 64, left: 38 });
	});

	it("bez wymiarow (SSR-guard) zwraca dotychczasowa pozycje pod kareta", () => {
		expect(clampDropdownPosition(caret, null, null)).toEqual({ top: 64, left: 10 });
	});
});
