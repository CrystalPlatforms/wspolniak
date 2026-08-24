// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ReactionTarget } from "@/db/post-reactions/queries";
import { PostWhoReacted } from "./post-who-reacted";

/**
 * Założenia (rewizja HITL #161): przycisk „Kto zareagował" w nagłówku posta,
 * obok „Dodaj do Biblioteki", wymiarów przycisku PostActions (3 kropki):
 * size-12 mobile / size-16 desktop, ikona size-6/size-8. Klik otwiera dialog
 * wszystkich typów pogrupowanych (emoji + imiona), lista pobierana przy otwarciu.
 */

const POST_TARGET: ReactionTarget = { kind: "post", postId: "post-1" };

type ReactionUserDTO = {
	id: string;
	reactionType: string;
	user: { id: string; name: string } | null;
};

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

function stubUsers(users: ReactionUserDTO[]) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: url.includes("/reactions/users") ? users : [],
					}),
			}),
		),
	);
}

describe("PostWhoReacted", () => {
	it("renders a header button the same size as the PostActions (3-dot) button", () => {
		stubUsers([]);
		render(<PostWhoReacted target={POST_TARGET} />, { wrapper: createWrapper() });

		const button = screen.getByRole("button", { name: "Kto zareagował" });
		expect(button.classList.contains("size-12")).toBe(true);
		expect(button.classList.contains("sm:size-16")).toBe(true);
	});

	it("opens the grouped dialog with emoji sections and names", async () => {
		const user = userEvent.setup();
		stubUsers([
			{ id: "r1", reactionType: "heart", user: { id: "u1", name: "Tomek" } },
			{ id: "r2", reactionType: "heart", user: { id: "u2", name: "Ala" } },
			{ id: "r3", reactionType: "flame", user: { id: "u3", name: "Kasia" } },
		]);
		render(<PostWhoReacted target={POST_TARGET} />, { wrapper: createWrapper() });

		await user.click(screen.getByRole("button", { name: "Kto zareagował" }));

		expect(await screen.findByText("Kto zareagował")).toBeTruthy();
		expect(screen.getByText("Tomek")).toBeTruthy();
		expect(screen.getByText("Ala")).toBeTruthy();
		expect(screen.getByText("Kasia")).toBeTruthy();
		// Sekcje z emoji (heart + flame jako obrazki).
		const imgs = document.querySelectorAll("img");
		const srcs = Array.from(imgs).map((img) => img.getAttribute("src"));
		expect(srcs).toContain("/emoji/heart.png");
		expect(srcs).toContain("/emoji/flame.png");
	});

	it("shows the empty state when nobody reacted", async () => {
		const user = userEvent.setup();
		stubUsers([]);
		render(<PostWhoReacted target={POST_TARGET} />, { wrapper: createWrapper() });

		await user.click(screen.getByRole("button", { name: "Kto zareagował" }));

		expect(await screen.findByText("Brak reakcji")).toBeTruthy();
	});
});
