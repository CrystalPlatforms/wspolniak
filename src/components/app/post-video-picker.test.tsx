// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { vi } from "vitest";

// Server fn pickera — mock na granicy systemu (bez sieci).
vi.mock("@/core/functions/video-feed", () => ({
	getVideoFeedPage: vi.fn(async () => ({
		data: [
			{
				id: "v1",
				youtubeVideoId: "yt-v1",
				title: "Wakacje",
				description: null,
				authorId: "u1",
				thumbnailUrl: "/t1.jpg",
				createdAt: new Date("2026-01-01T00:00:00Z"),
				author: { id: "u1", name: "Admin" },
			},
			{
				id: "v2",
				youtubeVideoId: "yt-v2",
				title: "Urodziny",
				description: null,
				authorId: "u1",
				thumbnailUrl: "/t2.jpg",
				createdAt: new Date("2026-01-02T00:00:00Z"),
				author: { id: "u1", name: "Admin" },
			},
		],
	})),
}));

import { PostVideoPicker } from "./post-video-picker";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

// Radix (Dialog overlay) may use pointer-capture APIs absent in jsdom.
beforeEach(() => {
	window.PointerEvent = window.MouseEvent as never;
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("PostVideoPicker", () => {
	it("closes the dialog after picking the first video (#140)", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<PostVideoPicker videoIds={[]} onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		await user.click(screen.getByRole("button", { name: /dodaj wideo/i }));
		await user.click(await screen.findByRole("button", { name: /wakacje/i }));

		expect(onChange).toHaveBeenCalledWith(["v1"]);
		// Dialog znika — formularz z listą wybranych wideo jest od razu widoczny.
		expect(screen.queryByText("Wybierz wideo")).toBeNull();
	});

	it("keeps the dialog open when adding subsequent videos", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<PostVideoPicker videoIds={["v1"]} onChange={onChange} />, {
			wrapper: createWrapper(),
		});

		await user.click(screen.getByRole("button", { name: /wideo \(1\/10\)/i }));
		await user.click(await screen.findByRole("button", { name: /urodziny/i }));

		expect(onChange).toHaveBeenCalledWith(["v1", "v2"]);
		// Kolejne wideo nie zamyka dialogu — można klikać dalej w kolejności.
		expect(screen.getByText("Wybierz wideo")).toBeDefined();
	});
});
