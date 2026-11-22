// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia (reviza usera #245): ikona NIE jest wolnym polem tekstowym — admin
// wybiera ją z siatki (radiogroup), więc nie da się zapisać nazwy, której
// overlay nie obsłuży. Wybrana pozycja ma aria-checked=true.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceSection } from "./maintenance-section";

const initialConfig = {
	enabled: false,
	message: "Wspólniak jest w trakcie naprawy",
	subtitle: "Wróć za chwilę",
	icon: "alert-triangle",
};

describe("MaintenanceSection", () => {
	it("shows the current config values", () => {
		render(<MaintenanceSection config={initialConfig} isSaving={false} onSave={vi.fn()} />);

		expect(screen.getByDisplayValue("Wspólniak jest w trakcie naprawy")).toBeDefined();
		expect(screen.getByDisplayValue("Wróć za chwilę")).toBeDefined();
		// Wybrana ikona: prawdziwy radio input z checked=true
		expect((screen.getByRole("radio", { name: "Ostrzeżenie" }) as HTMLInputElement).checked).toBe(
			true,
		);
	});

	it("submits updated message, subtitle, icon pick and enabled toggle", async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		render(<MaintenanceSection config={initialConfig} isSaving={false} onSave={onSave} />);

		await user.click(screen.getByRole("switch"));
		await user.clear(screen.getByLabelText(/napis/i));
		await user.type(screen.getByLabelText(/napis/i), "Chwila przerwy");
		await user.clear(screen.getByLabelText(/podtytuł/i));
		await user.type(screen.getByLabelText(/podtytuł/i), "Wracamy");
		// Wybór ikony z siatki (zamiast wpisywania nazwy)
		await user.click(screen.getByRole("radio", { name: "Naprawa" }));
		await user.click(screen.getByRole("button", { name: /zapisz/i }));

		expect(onSave).toHaveBeenCalledWith({
			enabled: true,
			message: "Chwila przerwy",
			subtitle: "Wracamy",
			icon: "wrench",
		});
	});

	it("shows an error message when provided", () => {
		render(
			<MaintenanceSection
				config={initialConfig}
				isSaving={false}
				errorMessage="Nie udało się zapisać"
				onSave={vi.fn()}
			/>,
		);

		expect(screen.getByText("Nie udało się zapisać")).toBeDefined();
	});

	it("disables the save button while saving", () => {
		render(<MaintenanceSection config={initialConfig} isSaving={true} onSave={vi.fn()} />);

		expect(screen.getByRole("button", { name: /zapis/i })).toHaveProperty("disabled", true);
	});
});
