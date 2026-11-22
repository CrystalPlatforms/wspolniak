// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { MobileSidebar } from "./mobile-sidebar";

// Router pathname — system boundary (external framework).
let currentPathname = "/app";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, className, children, ...rest }: ComponentProps<"a"> & { to: string }) => (
		<a href={to} className={className} {...rest}>
			{children}
		</a>
	),
	useLocation: () => ({ pathname: currentPathname }),
}));

function setPathname(pathname: string) {
	currentPathname = pathname;
}

// Linki nawigacji są w drawerze (Radix Sheet) — otwórz go przez hamburger.
async function openMenu() {
	await userEvent.click(screen.getByRole("button", { name: /otwórz menu/i }));
}

describe("MobileSidebar — Biblioteka nav link (#129)", () => {
	it("renders a Biblioteka nav link to /app/lib", async () => {
		setPathname("/app");
		render(<MobileSidebar />);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("href")).toBe("/app/lib");
	});

	it("highlights the Biblioteka link when on /app/lib", async () => {
		setPathname("/app/lib");
		render(<MobileSidebar />);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("class")).toContain("font-bold");
	});

	it("fills the bookmark icon white when Biblioteka is active", async () => {
		setPathname("/app/lib");
		render(<MobileSidebar />);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("renders the filled Albumy icon when /app/albums is active (nowa reviza)", async () => {
		setPathname("/app/albums");
		render(<MobileSidebar />);
		await openMenu();

		const link = screen.getByRole("link", { name: /^albumy$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});
});

// Ustawienia przeniesione z menu do nagłówka feeda (ikona Cog obok „Witaj",
// reviza usera) — pozycja menu znika z obu sidebarów.
describe("MobileSidebar — Ustawienia moved to feed header (reviza usera)", () => {
	it("does not render a Ustawienia nav link anymore", async () => {
		setPathname("/app");
		render(<MobileSidebar />);
		await openMenu();

		expect(screen.queryByRole("link", { name: /^ustawienia$/i })).toBeNull();
	});
});

// F7 #176: flaga albums chowa pozycję „Albumy" też w drawerze mobilnym;
// kropka „new” renderuje się obok etykiety gdy useAlbumsNewDot() = true.
const mockUseAlbumsNewDot = vi.fn();
vi.mock("@/core/albums-seen", () => ({
	useAlbumsNewDot: () => mockUseAlbumsNewDot() ?? false,
}));

describe("MobileSidebar — flaga albums i kropka „new” (#176)", () => {
	it("renders the new-albums dot next to the Albumy label", async () => {
		mockUseAlbumsNewDot.mockReturnValue(true);
		setPathname("/app");
		render(<MobileSidebar />);
		await openMenu();

		const link = screen.getByRole("link", { name: /albumy/i });
		expect(link.querySelector("span[aria-hidden='true']")).not.toBeNull();
	});

	it("renders no dot when there are no new albums", async () => {
		mockUseAlbumsNewDot.mockReturnValue(false);
		setPathname("/app");
		render(<MobileSidebar />);
		await openMenu();

		const link = screen.getByRole("link", { name: /albumy/i });
		expect(link.querySelector("span[aria-hidden='true']")).toBeNull();
	});
});
