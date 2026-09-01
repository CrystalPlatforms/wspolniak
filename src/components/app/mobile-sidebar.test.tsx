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
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("href")).toBe("/app/lib");
	});

	it("highlights the Biblioteka link when on /app/lib", async () => {
		setPathname("/app/lib");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("class")).toContain("font-bold");
	});

	it("fills the bookmark icon white when Biblioteka is active", async () => {
		setPathname("/app/lib");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("hides the Biblioteka nav link when library disabled", async () => {
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: false,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		expect(screen.queryByRole("link", { name: /^biblioteka$/i })).toBeNull();
	});
});

// Założenia kontraktu (F8 #159): pozycja „Chat" w drawerze (nazwa usera — nie
// „Czat"), /app/chat, MessageSquare wypełniona gdy aktywna; flaga chat OFF
// ukrywa link (wzorzec Wideo/Biblioteka).
describe("MobileSidebar — Chat nav link (F8 #159)", () => {
	it("renders a Chat nav link to /app/chat", async () => {
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /^chat$/i });
		expect(link.getAttribute("href")).toBe("/app/chat");
	});

	it("hides the Chat nav link when chat disabled", async () => {
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: false,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		expect(screen.queryByRole("link", { name: /^chat$/i })).toBeNull();
	});

	it("fills the message icon when Chat is active", async () => {
		setPathname("/app/chat");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /^chat$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});
});

// Albumy (#170): pozycja mobilnego menu — mirror desktop-sidebar (jedno źródło
// prawdy trzymane ręcznie w obu plikach).
describe("MobileSidebar — Albumy nav link (#170)", () => {
	it("renders an Albumy nav link to /app/albums", async () => {
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /^albumy$/i });
		expect(link.getAttribute("href")).toBe("/app/albums");
	});

	it("leaves the Albumy icon unfilled when /app/albums is active (#170 reviza)", async () => {
		setPathname("/app/albums");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /^albumy$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});
});

// Ustawienia przeniesione z menu do nagłówka feeda (ikona Cog obok „Witaj",
// reviza usera) — pozycja menu znika z obu sidebarów.
describe("MobileSidebar — Ustawienia moved to feed header (reviza usera)", () => {
	it("does not render a Ustawienia nav link anymore", async () => {
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
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
	it("hides the Albumy nav item when the albums flag is off", async () => {
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: false,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		expect(screen.queryByRole("link", { name: /^albumy/i })).toBeNull();
	});

	it("renders the new-albums dot next to the Albumy label", async () => {
		mockUseAlbumsNewDot.mockReturnValue(true);
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /albumy/i });
		expect(link.querySelector("span[aria-hidden='true']")).not.toBeNull();
	});

	it("renders no dot when there are no new albums", async () => {
		mockUseAlbumsNewDot.mockReturnValue(false);
		setPathname("/app");
		render(
			<MobileSidebar
				featureFlags={{
					video: true,
					markdown: true,
					library: true,
					chat: true,
					albums: true,
					ai: false,
				}}
			/>,
		);
		await openMenu();

		const link = screen.getByRole("link", { name: /albumy/i });
		expect(link.querySelector("span[aria-hidden='true']")).toBeNull();
	});
});
