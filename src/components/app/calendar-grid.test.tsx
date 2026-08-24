// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type CalendarEventDTO, CalendarGrid, formatEventDate } from "./calendar-grid";

/**
 * Założenia (#163 Kalendarz v2): grid 2 kafelki obok siebie (grid-cols-2),
 * kafelek = pogrubiona data „1 stycznia" (miesiąc w dopełniaczu, mała litera)
 * + tytuł wydarzenia pod datą; opis NIE jest pokazywany na kafelku; admin
 * dodatkowo widzi przyciski edytuj/usuń na każdym kafelku.
 */

const EVENTS: CalendarEventDTO[] = [
	{ id: "e1", title: "Urodziny Kasi", description: null, day: 15, month: 3 },
	{ id: "e2", title: "Rocznica", description: "opis ukryty", day: 1, month: 1 },
	{ id: "e3", title: "Imieniny", description: null, day: 24, month: 12 },
];

describe("formatEventDate", () => {
	it("formats the date with a genitive month name in Polish", () => {
		expect(formatEventDate(1, 1)).toBe("1 stycznia");
		expect(formatEventDate(15, 3)).toBe("15 marca");
		expect(formatEventDate(24, 12)).toBe("24 grudnia");
	});
});

describe("CalendarGrid", () => {
	it("renders a bold date and the title for each event", () => {
		render(<CalendarGrid events={EVENTS} />);

		const boldDate = screen.getByText("15 marca");
		expect(boldDate.classList.contains("font-bold")).toBe(true);
		expect(screen.getByText("1 stycznia")).toBeTruthy();
		expect(screen.getByText("24 grudnia")).toBeTruthy();
		expect(screen.getByText("Urodziny Kasi")).toBeTruthy();
		expect(screen.getByText("Rocznica")).toBeTruthy();
		expect(screen.getByText("Imieniny")).toBeTruthy();
	});

	it("lays tiles out in a two-column grid", () => {
		const { container } = render(<CalendarGrid events={EVENTS} />);
		const grid = container.querySelector("[data-slot='calendar-grid']");
		expect(grid?.classList.contains("grid-cols-2")).toBe(true);
	});

	it("does not show the description on a tile", () => {
		render(<CalendarGrid events={EVENTS} />);
		expect(screen.queryByText("opis ukryty")).toBeNull();
	});

	it("hides edit and delete buttons for regular members", () => {
		render(<CalendarGrid events={EVENTS} />);
		expect(screen.queryByTitle("Edytuj")).toBeNull();
		expect(screen.queryByTitle("Usuń")).toBeNull();
	});

	it("shows edit and delete buttons for admin and fires callbacks", async () => {
		const onEdit = vi.fn();
		const onDelete = vi.fn();
		render(<CalendarGrid events={EVENTS} isAdmin onEdit={onEdit} onDelete={onDelete} />);

		await userEvent.click(screen.getAllByTitle("Edytuj")[0] as HTMLElement);
		expect(onEdit).toHaveBeenCalledWith(EVENTS[0]);

		await userEvent.click(screen.getAllByTitle("Usuń")[1] as HTMLElement);
		expect(onDelete).toHaveBeenCalledWith(EVENTS[1]);
	});
});
