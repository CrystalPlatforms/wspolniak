// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * TDD #247 — założenia:
 * - useInView zaczyna od inView=false; IntersectionObserver to granica systemu
 *   (stub w @/test/intersection-observer-stub, bo jsdom go nie implementuje).
 * - Semantyka "once": po pierwszym isIntersecting=true hook odpina obserwację
 *   i zostaje na true (lazy mount bez flappy przełączania przy scrollu).
 * - Guard SSR (typeof window) chroniony kodem, nie testem — jsdom zawsze ma window.
 */
import { act, render, screen } from "@testing-library/react";
import { installIntersectionObserverStub, lastStub } from "@/test/intersection-observer-stub";
import { useInView } from "./use-in-view";

function Probe() {
	const { ref, inView } = useInView();
	return (
		<div ref={ref}>
			<span>{inView ? "visible" : "hidden"}</span>
		</div>
	);
}

describe("useInView", () => {
	beforeEach(() => {
		installIntersectionObserverStub();
	});

	it("raportuje inView=true gdy observer zgłosi przecięcie", () => {
		render(<Probe />);
		expect(screen.getByText("hidden")).toBeTruthy();

		act(() => {
			lastStub().trigger(true);
		});

		expect(screen.getByText("visible")).toBeTruthy();
	});

	it("zaczyna od false i obserwuje element ref", () => {
		render(<Probe />);
		const stub = lastStub();
		expect(stub.elements).toHaveLength(1);
		expect(screen.getByText("hidden")).toBeTruthy();
	});

	it("odpina obserwację po pierwszym przecięciu (once)", () => {
		render(<Probe />);
		const stub = lastStub();
		expect(stub.elements).toHaveLength(1);

		act(() => {
			stub.trigger(true);
		});

		expect(stub.elements).toHaveLength(0);
		expect(screen.getByText("visible")).toBeTruthy();
	});

	it("sprząta obserwację po odmontowaniu", () => {
		const { unmount } = render(<Probe />);
		const stub = lastStub();
		expect(stub.elements).toHaveLength(1);

		unmount();

		expect(stub.elements).toHaveLength(0);
	});
});
