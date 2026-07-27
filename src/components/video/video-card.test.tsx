// SPDX-License-Identifier: AGPL-3.0-or-later

import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import type { VideoFeedItem } from "@/db/videos";
import { VideoCard } from "./video-card";

// Link TanStack zamieniony na zwykły <a href> — granica frameworka.
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		children,
		...rest
	}: ComponentProps<"a"> & { to: string; params?: { id?: string } }) => (
		<a href={to.replace("$id", params?.id ?? "")} {...rest}>
			{children}
		</a>
	),
}));

const video: VideoFeedItem = {
	id: "v-1",
	youtubeVideoId: "yt-1",
	title: "Wakacje nad morzem",
	description: null,
	authorId: "u1",
	thumbnailUrl: "https://i.ytimg.com/v1.jpg",
	createdAt: new Date("2026-07-27T12:00:00Z"),
	author: { id: "u1", name: "Kasia" },
};

describe("VideoCard", () => {
	it("renders thumbnail, title, author and machine-readable date", () => {
		const { container } = render(<VideoCard video={video} />);

		expect(screen.getByText("Wakacje nad morzem")).toBeTruthy();
		expect(screen.getByText("Kasia")).toBeTruthy();
		expect(screen.getByRole("img").getAttribute("src")).toBe("https://i.ytimg.com/v1.jpg");

		const time = container.querySelector("time");
		expect(time?.getAttribute("datetime")).toBe("2026-07-27T12:00:00.000Z");
	});

	it("links to the video detail page", () => {
		render(<VideoCard video={video} />);

		expect(screen.getByRole("link").getAttribute("href")).toBe("/app/video/v-1");
	});
});
