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
		render(<DesktopSidebar featureFlags={{ video: true, markdown: true }} />);

		expect(screen.queryByRole("link", { name: /^wideo$/i })).not.toBeNull();
		expect(screen.queryByRole("link", { name: /dodaj wideo/i })).not.toBeNull();
	});

	it("hides Wideo nav link and Dodaj wideo button when video disabled", () => {
		setPathname("/app");
		render(<DesktopSidebar featureFlags={{ video: false, markdown: true }} />);

		expect(screen.queryByRole("link", { name: /^wideo$/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /dodaj wideo/i })).toBeNull();
	});
});

describe("DesktopSidebar — Biblioteka nav link (#129)", () => {
	it("renders a Biblioteka nav link to /app/lib", () => {
		setPathname("/app");
		render(<DesktopSidebar featureFlags={{ video: true, markdown: true }} />);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("href")).toBe("/app/lib");
	});

	it("highlights the Biblioteka link when on /app/lib", () => {
		setPathname("/app/lib");
		render(<DesktopSidebar featureFlags={{ video: true, markdown: true }} />);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("class")).toContain("font-bold");
	});

	it("fills the bookmark icon white when Biblioteka is active", () => {
		setPathname("/app/lib");
		render(<DesktopSidebar featureFlags={{ video: true, markdown: true }} />);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		// currentColor = aktywny kolor tekstu (biały w trybie ciemnym) — wypełniona zakładka.
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("leaves the bookmark icon unfilled when Biblioteka is not active", () => {
		setPathname("/app");
		render(<DesktopSidebar featureFlags={{ video: true, markdown: true }} />);

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("none");
	});

	it("fills the Wideo icon when active", () => {
		setPathname("/app/video");
		render(<DesktopSidebar featureFlags={{ video: true, markdown: true }} />);

		const link = screen.getByRole("link", { name: /^wideo$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("fills the Kalendarz icon when active as admin", () => {
		setPathname("/app/calendar");
		// „admin" przez zmienną — biome traktuje statyczny role="admin" jako niepoprawną rolę ARIA
		// i usuwa atrybut; DesktopSidebar.role to rola użytkownika, nie ARIA.
		const adminRole = "admin";
		render(<DesktopSidebar role={adminRole} featureFlags={{ video: true, markdown: true }} />);

		const link = screen.getByRole("link", { name: /^kalendarz$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("shows the Biblioteka link regardless of feature flags (no flag gating)", () => {
		setPathname("/app");
		render(<DesktopSidebar featureFlags={{ video: false, markdown: false }} />);

		expect(screen.queryByRole("link", { name: /^biblioteka$/i })).not.toBeNull();
	});
});
