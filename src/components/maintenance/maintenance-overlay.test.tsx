// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaintenanceOverlay, shouldShowMaintenanceOverlay } from "./maintenance-overlay";

describe("MaintenanceOverlay", () => {
	it("renders the message and subtitle from props", () => {
		render(
			<MaintenanceOverlay
				message="Wspólniak jest w trakcie naprawy"
				subtitle="Wróć za chwilę"
				icon="alert-triangle"
			/>,
		);

		// getByText throws if the element is missing — no extra assertion needed
		expect(screen.getByText("Wspólniak jest w trakcie naprawy")).toBeDefined();
		expect(screen.getByText("Wróć za chwilę")).toBeDefined();
	});

	it("renders an svg icon", () => {
		const { container } = render(<MaintenanceOverlay message="A" subtitle="B" icon="wrench" />);

		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("uses the provided icon name when it is a known icon", () => {
		render(<MaintenanceOverlay message="A" subtitle="B" icon="wrench" />);

		expect(screen.getByRole("img", { name: "wrench" })).toBeDefined();
	});

	it("falls back to alert-triangle when the icon name is unknown", () => {
		render(<MaintenanceOverlay message="A" subtitle="B" icon="nieistniejaca-ikona" />);

		expect(screen.getByRole("img", { name: "alert-triangle" })).toBeDefined();
	});
});

describe("shouldShowMaintenanceOverlay", () => {
	const baseConfig = {
		enabled: true,
		message: "M",
		subtitle: "S",
		icon: "alert-triangle",
	};

	it("returns true when maintenance is enabled and user is not admin", () => {
		expect(shouldShowMaintenanceOverlay(baseConfig, "member")).toBe(true);
	});

	it("returns false when maintenance is enabled but user is admin", () => {
		expect(shouldShowMaintenanceOverlay(baseConfig, "admin")).toBe(false);
	});

	it("returns false when maintenance is disabled regardless of role", () => {
		expect(shouldShowMaintenanceOverlay({ ...baseConfig, enabled: false }, "member")).toBe(false);
	});
});
