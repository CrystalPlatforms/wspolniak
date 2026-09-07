// SPDX-License-Identifier: AGPL-3.0-or-later
// Video v2 F3 (#197): edycja dostaje ten sam flow dodawania co kompozytor
// (picker → dialog tytułu → karta), unified lista (istniejące + nowe) z drag &
// drop, × na istniejącym wymaga potwierdzenia i woła onVideoDelete DOKŁADNIE RAZ
// (YouTube delete po stronie route, fire-and-forget). Zapis wysyła videoPlan —
// existing 1:1, kolejność listy = kolejność odtwarzania.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PostVideoEntry } from "@/db/posts/schema";
import { EditPostForm } from "./edit-post-form";

const baseFlags = {
	markdown: true,
	library: true,
	chat: true,
	albums: true,
	ai: false,
};

function makeVideo(name: string): PostVideoEntry {
	return {
		youtubeVideoId: name,
		title: name === "yt-1" ? "Pierwszy" : "Drugi",
		thumbnailUrl: `https://i.ytimg.com/vi/${name}/hq.jpg`,
	};
}

describe("EditPostForm — Video v2 F3 (#197)", () => {
	it("renders the add-video flow and existing videos together (us story 12)", () => {
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-1")]}
				featureFlags={baseFlags}
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		// Ten sam przycisk co w kompozytorze (przy 1 wideo pokazuje „1/5") + karta.
		expect(screen.getByTitle(/dodaj wideo/i)).toBeDefined();
		expect(screen.getByText("Pierwszy")).toBeDefined();
		expect(screen.getByText(/istniejące/i)).toBeDefined();
	});

	it("removing an existing video requires confirmation and fires onVideoDelete exactly once (us stories 13–14)", async () => {
		const onVideoDelete = vi.fn();
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-1")]}
				featureFlags={baseFlags}
				onSubmit={onSubmit}
				onVideoDelete={onVideoDelete}
				isSubmitting={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /usuń wideo/i }));
		expect(screen.getByText(/usunąć wideo\?/i)).toBeDefined();

		// Anuluj — nic się nie dzieje.
		await user.click(screen.getByRole("button", { name: /anuluj/i }));
		expect(onVideoDelete).not.toHaveBeenCalled();

		// Ponownie → Usuń — delete dokładnie raz.
		await user.click(screen.getByRole("button", { name: /usuń wideo/i }));
		await user.click(screen.getByRole("button", { name: /^usuń$/i }));
		expect(onVideoDelete).toHaveBeenCalledExactlyOnceWith("yt-1");
		expect(screen.queryByText("Pierwszy")).toBeNull();
	});

	it("submits the video plan preserving list order (existing 1:1)", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={[makeVideo("yt-2"), makeVideo("yt-1")]}
				featureFlags={baseFlags}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				videoPlan: [
					{ kind: "existing", entry: makeVideo("yt-2") },
					{ kind: "existing", entry: makeVideo("yt-1") },
				],
			}),
		);
	});
});
