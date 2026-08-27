// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { DesktopSidebar } from "./desktop-sidebar";

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

describe("DesktopSidebar — Wideo feature flag", () => {
	it("renders Wideo nav link and Dodaj wideo button when video enabled", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		expect(screen.queryByRole("link", { name: /^wideo$/i })).not.toBeNull();
		expect(screen.queryByRole("link", { name: /dodaj wideo/i })).not.toBeNull();
	});

	it("hides Wideo nav link and Dodaj wideo button when video disabled", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: false, markdown: true, library: true, chat: true }} />,
		);

		expect(screen.queryByRole("link", { name: /^wideo$/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /dodaj wideo/i })).toBeNull();
	});
});

describe("DesktopSidebar — Biblioteka nav link (#129)", () => {
	it("renders a Biblioteka nav link to /app/lib", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("href")).toBe("/app/lib");
	});

	it("highlights the Biblioteka link when on /app/lib", () => {
		setPathname("/app/lib");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("class")).toContain("font-bold");
	});

	it("fills the bookmark icon white when Biblioteka is active", () => {
		setPathname("/app/lib");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		// currentColor = aktywny kolor tekstu (biały w trybie ciemnym) — wypełniona zakładka.
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("leaves the bookmark icon unfilled when Biblioteka is not active", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});

	it("fills the Wideo icon when active", () => {
		setPathname("/app/video");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^wideo$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("fills the Kalendarz icon when active as admin", () => {
		setPathname("/app/calendar");
		// „admin" przez zmienną — biome traktuje statyczny role="admin" jako niepoprawną rolę ARIA
		// i usuwa atrybut; DesktopSidebar.role to rola użytkownika, nie ARIA.
		const adminRole = "admin";
		render(
			<DesktopSidebar
				role={adminRole}
				featureFlags={{ video: true, markdown: true, library: true, chat: true }}
			/>,
		);

		const link = screen.getByRole("link", { name: /^kalendarz$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("shows the Kalendarz nav link for a regular member (#163)", () => {
		setPathname("/app");
		const memberRole = "member";
		render(
			<DesktopSidebar
				role={memberRole}
				featureFlags={{ video: true, markdown: true, library: true, chat: true }}
			/>,
		);

		expect(screen.queryByRole("link", { name: /^kalendarz$/i })).not.toBeNull();
	});

	it("hides the Biblioteka nav link when library disabled", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: false, chat: true }} />,
		);

		expect(screen.queryByRole("link", { name: /^biblioteka$/i })).toBeNull();
	});
});

// Założenia kontraktu (F8 #159): pozycja „Chat" (nazwa usera — nie „Czat")
// pod Biblioteką, /app/chat, MessageSquare wypełniona gdy aktywna; flaga
// chat OFF ukrywa link (wzorzec Wideo/Biblioteka).
describe("DesktopSidebar — Chat nav link (F8 #159)", () => {
	it("renders a Chat nav link to /app/chat after Biblioteka", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^chat$/i });
		expect(link.getAttribute("href")).toBe("/app/chat");
	});

	it("hides the Chat nav link when chat disabled", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: false }} />,
		);

		expect(screen.queryByRole("link", { name: /^chat$/i })).toBeNull();
	});

	it("fills the message icon when Chat is active", () => {
		setPathname("/app/chat");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^chat$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("leaves the message icon unfilled when Chat is not active", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^chat$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});
});

// Albumy (#170): pozycja „Albumy" → /app/albums, widoczna dla zalogowanych
// członków (brak flagi w F1 — nav zawsze widoczny). Ikona Images wypełniona
// gdy aktywna (wzorzec Biblioteka/Wideo/Chat).
describe("DesktopSidebar — Albumy nav link (#170)", () => {
	it("renders an Albumy nav link to /app/albums", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^albumy$/i });
		expect(link.getAttribute("href")).toBe("/app/albums");
	});

	it("highlights the Albumy link but leaves the icon unfilled when active (#170 reviza)", () => {
		setPathname("/app/albums");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^albumy$/i });
		expect(link.getAttribute("class")).toContain("font-bold");
		// Ikona Images z lucide wypełniona wygląda źle — zostaje konturowa (reviza usera).
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});

	it("leaves the Albumy icon unfilled when not active", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		const link = screen.getByRole("link", { name: /^albumy$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});
});

// Ustawienia przeniesione z menu do nagłówka feeda (ikona Cog obok „Witaj",
// reviza usera) — pozycja menu znika z obu sidebarów.
describe("DesktopSidebar — Ustawienia moved to feed header (reviza usera)", () => {
	it("does not render a Ustawienia nav link anymore", () => {
		setPathname("/app");
		render(
			<DesktopSidebar featureFlags={{ video: true, markdown: true, library: true, chat: true }} />,
		);

		expect(screen.queryByRole("link", { name: /^ustawienia$/i })).toBeNull();
	});
});
