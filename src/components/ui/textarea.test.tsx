// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { FIELD_CLASS } from "./field-styles";
import { Textarea } from "./textarea";

// #249 + iteracja usera: każde pole renderuje dokładnie klasy wspólnego
// template (field-styles.ts). Różnić się może tylko rozmiar i typografia.
describe("Textarea — wspólny template pól (#249)", () => {
	it("renderuje wszystkie klasy FIELD_CLASS", () => {
		render(<Textarea aria-label="pole" />);

		const el = screen.getByLabelText("pole");
		for (const cls of FIELD_CLASS.split(" ")) {
			expect(el.className).toContain(cls);
		}
	});

	it("nie ma resztek starego stylu Shadcn (ring-[3px], ring-ring/50, focus-visible:border-ring)", () => {
		render(<Textarea aria-label="pole" />);

		const el = screen.getByLabelText("pole");
		expect(el.className).not.toContain("ring-[3px]");
		expect(el.className).not.toContain("ring-ring/50");
		expect(el.className).not.toContain("focus-visible:border-ring");
	});
});
