// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from "@testing-library/react";
import { AppleEmoji } from "./apple-emoji";

describe("AppleEmoji", () => {
	it("renders a self-hosted png for the given name at the requested size", () => {
		const { container } = render(<AppleEmoji name="flame" size={20} />);
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		expect(img?.getAttribute("src")).toBe("/emoji/flame.png");
		expect(img?.getAttribute("width")).toBe("20");
		expect(img?.getAttribute("height")).toBe("20");
	});

	it("is decorative (empty alt) and not draggable", () => {
		const { container } = render(<AppleEmoji name="heart" size={16} />);
		const img = container.querySelector("img");
		expect(img?.getAttribute("alt")).toBe("");
		expect(img?.getAttribute("draggable")).toBe("false");
	});
});
