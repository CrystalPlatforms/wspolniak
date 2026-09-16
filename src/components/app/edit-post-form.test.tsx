// SPDX-License-Identifier: AGPL-3.0-or-later
// Video v2 F3 (#197): edycja dostaje ten sam flow dodawania co kompozytor
// (picker → dialog tytułu → karta), unified lista (istniejące + nowe) z drag &
// drop, × na istniejącym wymaga potwierdzenia i woła onVideoDelete DOKŁADNIE RAZ
// (YouTube delete po stronie route, fire-and-forget). Zapis wysyła videoPlan —
// existing 1:1, kolejność listy = kolejność odtwarzania.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Pole opisu renderuje GradientAiButton (F2 #189), który czyta stan AL
// z react-query — testy formularza dostarczają providera i zamykają dostęp
// (effective: false), żeby przycisk pozostał ukryty; zachowanie przycisku
// testuje gradient-ai-button.test.tsx.
import type { ReactElement, ReactNode } from "react";
import { afterEach, vi } from "vitest";
import type { PostVideoEntry } from "@/db/posts/schema";
import { EditPostForm } from "./edit-post-form";

function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
	return rtlRender(ui, { wrapper, ...options });
}

function wrapper({ children }: { children: ReactNode }) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

vi.stubGlobal(
	"fetch",
	vi.fn().mockImplementation((url: string) => {
		if (String(url).includes("/api/ai/access")) {
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: { master: false, aiOptIn: false, aiBlocked: false, effective: false },
					}),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: null }) });
	}),
);

vi.mock("@/images/shrink", () => ({
	shrinkImageToLimit: vi.fn(),
	ShrinkError: class ShrinkError extends Error {
		name = "ShrinkError";
	},
}));

import { shrinkImageToLimit } from "@/images/shrink";

const mockShrink = vi.mocked(shrinkImageToLimit);

afterEach(() => {
	vi.clearAllMocks();
});

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

describe("EditPostForm — za duże zdjęcie (issue #200)", () => {
	function fileOfSize(name: string, bytes: number, type = "image/jpeg"): File {
		return new File([new Uint8Array(bytes)], name, { type });
	}

	function renderForm() {
		const onSubmit = vi.fn((_data: { files: File[] }) => {});
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
		return { onSubmit };
	}

	async function uploadFiles(files: File[]): Promise<void> {
		const input = document.querySelector("input[type='file']") as HTMLInputElement;
		await userEvent.upload(input, files);
	}

	it("dodaje za duży plik jako oflagowany podgląd (czerwony + wykrzyknik), zamiast odrzucać", async () => {
		renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);

		const flag = screen.getByRole("button", { name: /za duże: duze\.jpg/i });
		expect(flag.className).toContain("bg-destructive");
		expect(flag.querySelector("svg")).not.toBeNull();
		expect(screen.getAllByRole("img")).toHaveLength(1);
	});

	it("klik oflagowanego podglądu otwiera dialog z błędem (nazwa, rozmiar, limit 19 MB)", async () => {
		renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		await userEvent.click(screen.getByRole("button", { name: /za duże: duze\.jpg/i }));

		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("duze.jpg");
		expect(dialog.textContent).toContain("20 MB");
		expect(dialog.textContent).toContain("19 MB");
	});

	it("submit z oflagowanym zdjęciem jest zablokowany z konkretnym komunikatem", async () => {
		const { onSubmit } = renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(screen.getByText(/kliknij jego podgląd/i)).toBeDefined();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByRole("dialog")).toBeDefined();
	});

	it("zmniejszenie zdjęcia podmienia plik, zdejmuje flagę i umożliwia zapis", async () => {
		const { onSubmit } = renderForm();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		await userEvent.click(screen.getByRole("button", { name: /za duże: duze\.jpg/i }));

		const small = fileOfSize("duze.webp", 400 * 1024, "image/webp");
		mockShrink.mockResolvedValueOnce(small);

		await userEvent.click(screen.getByRole("button", { name: /zmniejsz zdjęcie/i }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(screen.queryByRole("button", { name: /za duże/i })).toBeNull());

		await userEvent.click(screen.getByRole("button", { name: /zapisz zmiany/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		const submitted = onSubmit.mock.calls[0]?.[0];
		expect(submitted?.files).toHaveLength(1);
		expect(submitted?.files[0]?.size).toBe(400 * 1024);
	});

	it("limit to 19 MB — 18 MB przechodzi bez flagi, 20 MB jest oflagowane", async () => {
		renderForm();

		await uploadFiles([fileOfSize("mniejsze.jpg", 18 * 1024 * 1024)]);
		expect(screen.queryByRole("button", { name: /za duże/i })).toBeNull();

		await uploadFiles([fileOfSize("duze.jpg", 20 * 1024 * 1024)]);
		expect(screen.getByRole("button", { name: /za duże: duze\.jpg/i })).toBeDefined();
	});
});
