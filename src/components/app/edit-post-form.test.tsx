// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditPostForm } from "./edit-post-form";

const baseFlags = {
	markdown: true,
	library: true,
	chat: true,
	albums: true,
	ai: false,
};

describe("EditPostForm — Video v2 (#194)", () => {
	it("renders no video picker (add/remove in edit lands in F3)", () => {
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				featureFlags={baseFlags}
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.queryByRole("button", { name: /dodaj wideo/i })).toBeNull();
	});

	it("round-trips existing videos untouched on save (order and titles preserved)", async () => {
		const onSubmit = vi.fn();
		const videos = [
			{
				youtubeVideoId: "yt-2",
				title: "Drugi",
				thumbnailUrl: "https://i.ytimg.com/vi/yt-2/default.jpg",
			},
			{
				youtubeVideoId: "yt-1",
				title: "Pierwszy",
				thumbnailUrl: "https://i.ytimg.com/vi/yt-1/default.jpg",
			},
		];
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideos={videos}
				featureFlags={baseFlags}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		// Wideo idą w kółko bez zmian (kolejność + tytuły) — edycja listy to F3.
		expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ videos }));
	});

	it("blokuje zapis tekstu >2000 znaków z konkretnym komunikatem", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				featureFlags={baseFlags}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		const long = "a".repeat(2001);
		const description = screen.getByLabelText(/^tekst$/i);
		fireEvent.change(description, { target: { value: long } });
		await user.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(screen.getByText(/za długi/i)).toBeDefined();
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
