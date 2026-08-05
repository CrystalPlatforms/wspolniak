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
