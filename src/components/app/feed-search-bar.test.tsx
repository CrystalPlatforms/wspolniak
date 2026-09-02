// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react";
import { FeedSearchBar } from "./feed-search-bar";

const navigateMock = vi.fn();

// Komponent korzysta z routera tylko przez useNavigate — wystarczy stub.
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

describe("FeedSearchBar (F7 #185)", () => {
	beforeEach(() => navigateMock.mockClear());

	it("beam animuje, gdy pole jest puste", () => {
		const { container } = render(<FeedSearchBar query="" onQueryChange={vi.fn()} />);
		const beam = container.querySelector("[data-beam]");
		expect(beam).not.toBeNull();
		expect(beam?.className).not.toContain("beam-paused");
	});

	it("beam zamiera podczas pisania (freeze)", () => {
		const { container } = render(<FeedSearchBar query="kto" onQueryChange={vi.fn()} />);
		const beam = container.querySelector("[data-beam]");
		expect(beam?.className).toContain("beam-paused");
	});

	it("wpisanie przekazuje wartość do rodzica", () => {
		const onQueryChange = vi.fn();
		render(<FeedSearchBar query="" onQueryChange={onQueryChange} />);
		fireEvent.change(screen.getByLabelText("Szukaj w feedzie"), { target: { value: "kto" } });
		expect(onQueryChange).toHaveBeenCalledWith("kto");
	});

	it("przycisk wyślij nawiguje do /app/ai z zapytaniem", () => {
		render(<FeedSearchBar query="Jak działa magic link?" onQueryChange={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "Wyślij zapytanie do AL" }));
		expect(navigateMock).toHaveBeenCalledWith(
			expect.objectContaining({ to: "/app/ai", search: { q: "Jak działa magic link?" } }),
		);
	});

	it("przycisk wyślij przy pustym polu nie nawiguje", () => {
		render(<FeedSearchBar query="   " onQueryChange={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "Wyślij zapytanie do AL" }));
		expect(navigateMock).not.toHaveBeenCalled();
	});

	it("trimuje zapytanie przed przekazaniem do AL", () => {
		render(<FeedSearchBar query="  pytanie testowe  " onQueryChange={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "Wyślij zapytanie do AL" }));
		expect(navigateMock).toHaveBeenCalledWith(
			expect.objectContaining({ search: { q: "pytanie testowe" } }),
		);
	});
});
