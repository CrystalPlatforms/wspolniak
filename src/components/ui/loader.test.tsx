// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from "@testing-library/react";
import { Loader } from "./loader";

describe("Loader", () => {
	it("renders six dots with status role when loading", () => {
		const { container, getByRole } = render(<Loader />);
		const status = getByRole("status");
		expect(status.getAttribute("aria-label")).toBe("Ładowanie");
		expect(container.querySelectorAll(".dot")).toHaveLength(6);
	});

	it("hides immediately when loading is false", () => {
		const { container } = render(<Loader loading={false} />);
		expect(container.firstChild).toBeNull();
	});

	it("sets spinner size from size prop (tailwind units times four)", () => {
		const { container } = render(<Loader size={8} />);
		const element = container.firstChild as HTMLElement;
		expect(element.style.getPropertyValue("--uib-size")).toBe("32px");
	});

	it("defaults size to 24px", () => {
		const { container } = render(<Loader />);
		const element = container.firstChild as HTMLElement;
		expect(element.style.getPropertyValue("--uib-size")).toBe("24px");
	});
});
