// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED):
 * - Szkielet lustruje strukturę PostCard: nagłówek (autor/czas/akcje), opis,
 *   sloty zdjęć w tej samej siatce, pasek reakcji/komentarzy.
 * - Sloty zdjęć mają stałe proporcje (aspect-square) — treść nie przesuwa układu.
 * - Shimmer to klasa .skeleton (CSS); reduced-motion wyłącza animację w CSS — HITL.
 * - Szkielet jest dekoracyjny: aria-hidden dla całej karty.
 */
import { render, screen } from "@testing-library/react";
import { PostCardSkeleton } from "./post-card-skeleton";

describe("PostCardSkeleton", () => {
	it("lustruje strukturę karty: nagłówek, opis, sloty zdjęć, pasek reakcji", () => {
		render(<PostCardSkeleton imageCount={2} />);
		expect(screen.getByTestId("skeleton-header")).toBeTruthy();
		expect(screen.getByTestId("skeleton-description")).toBeTruthy();
		expect(screen.getByTestId("skeleton-images")).toBeTruthy();
		expect(screen.getByTestId("skeleton-meta")).toBeTruthy();
	});

	it("cały szkielet jest aria-hidden — dekoracyjny dla czytników", () => {
		const { container } = render(<PostCardSkeleton />);
		const article = container.querySelector("article");
		expect(article?.getAttribute("aria-hidden")).toBe("true");
	});

	it("sloty zdjęć mają stałe proporcje (aspect-square) — zero layout shiftu", () => {
		render(<PostCardSkeleton imageCount={3} />);
		const slots = screen.getByTestId("skeleton-images").children;
		expect(slots.length).toBe(3);
		for (const slot of slots) {
			expect(slot.className).toContain("aspect-square");
		}
	});

	it("każdy blok nosi klasę shimmeru (.skeleton)", () => {
		const { container } = render(<PostCardSkeleton />);
		expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
	});

	it("bez opisu (hasDescription=false) blok opisu nie renderuje się", () => {
		render(<PostCardSkeleton hasDescription={false} />);
		expect(screen.queryByTestId("skeleton-description")).toBeNull();
	});
});
