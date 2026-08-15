// SPDX-License-Identifier: AGPL-3.0-or-later
import { cleanup, render } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

// Radix (Dialog overlay) may use pointer-capture APIs absent in jsdom.
beforeEach(() => {
	window.PointerEvent = window.MouseEvent as never;
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
	cleanup();
});

describe("Dialog overlay", () => {
	it("blurs the page behind dialogs and alerts (#139)", () => {
		render(
			<Dialog open>
				<DialogContent>
					<DialogTitle>Tytuł testowy</DialogTitle>
					<DialogDescription>Opis testowy</DialogDescription>
				</DialogContent>
			</Dialog>,
		);

		const overlay = document.querySelector('[data-slot="dialog-overlay"]');
		expect(overlay).not.toBeNull();
		// backdrop-blur-sm = rozmazane tło pod alertem/dialogiem.
		expect(overlay?.className).toContain("backdrop-blur-sm");
	});
});
