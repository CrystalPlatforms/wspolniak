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
		render(<MobileSidebar featureFlags={{ video: true, markdown: true }} />);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("href")).toBe("/app/lib");
	});

	it("highlights the Biblioteka link when on /app/lib", async () => {
		setPathname("/app/lib");
		render(<MobileSidebar featureFlags={{ video: true, markdown: true }} />);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.getAttribute("class")).toContain("font-bold");
	});

	it("fills the bookmark icon white when Biblioteka is active", async () => {
		setPathname("/app/lib");
		render(<MobileSidebar featureFlags={{ video: true, markdown: true }} />);
		await openMenu();

		const link = screen.getByRole("link", { name: /^biblioteka$/i });
		expect(link.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
	});

	it("shows the Biblioteka link regardless of feature flags (no flag gating)", async () => {
		setPathname("/app");
		render(<MobileSidebar featureFlags={{ video: false, markdown: false }} />);
		await openMenu();

		expect(screen.queryByRole("link", { name: /^biblioteka$/i })).not.toBeNull();
	});
});
