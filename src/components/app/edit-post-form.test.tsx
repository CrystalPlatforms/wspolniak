// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Picker wideo ma własne zależności (server fn + QueryClient) — izolujemy test formularza.
vi.mock("@/components/app/post-video-picker", () => ({
	PostVideoPicker: () => <div data-testid="post-video-picker" />,
}));

import { EditPostForm } from "./edit-post-form";

describe("EditPostForm", () => {
	it("shows the formatting switch (default OFF) for edits", () => {
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		// Slice 1: stara toolbar + przełącznik „Podgląd" zastąpione switchem → WYSIWYG.
		const toggle = screen.getByRole("switch", { name: /formatowanie/i });
		expect(toggle).toBeDefined();
		expect(toggle.getAttribute("aria-checked")).toBe("false");
	});

	it("shows the post Markdown source in the editable textarea (formatting preserved)", () => {
		render(
			<EditPostForm
				postId="p1"
				description="**istniejące** i *kursywa*"
				existingImages={[]}
				imageAccountHash="hash"
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
		// Raw Markdown source is editable — no formatting is lost on edit.
		expect(textarea.value).toBe("**istniejące** i *kursywa*");
	});

	it("renders the video picker when the video feature is enabled", () => {
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				featureFlags={{ video: true, markdown: false }}
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.queryByTestId("post-video-picker")).not.toBeNull();
	});

	it("hides the video picker when the video feature is disabled", () => {
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				featureFlags={{ video: false, markdown: true }}
				onSubmit={vi.fn()}
				isSubmitting={false}
			/>,
		);

		expect(screen.queryByTestId("post-video-picker")).toBeNull();
	});

	it("submits the initial video ids in order (parity with creating)", async () => {
		const onSubmit = vi.fn();
		render(
			<EditPostForm
				postId="p1"
				description="hello"
				existingImages={[]}
				imageAccountHash="hash"
				initialVideoIds={["v2", "v1"]}
				featureFlags={{ video: true, markdown: false }}
				onSubmit={onSubmit}
				isSubmitting={false}
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		// Edycja wysyła videoIds (kolejność = position) tak jak tworzenie — backend
		// robi setPostVideos(postId, videoIds) (replace). Idempotentne.
		expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ videoIds: ["v2", "v1"] }));
	});
});
