// SPDX-License-Identifier: AGPL-3.0-or-later

import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { useBootSettled } from "@/core/boot-splash";
import type { VideoFeedItem } from "@/db/videos";
import { VIDEO_CARD_STAGES, VideoCard } from "./video-card";

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

// useBootSettled mockujemy jako granicę czasu (timery boot-splash mają własne testy).
vi.mock("@/core/boot-splash", () => ({
	useBootSettled: vi.fn(),
}));

const mockedSettled = vi.mocked(useBootSettled);

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
	beforeEach(() => {
		mockedSettled.mockReset();
		// istniejące testy opisują stan warm (choreografia zakończona)
		mockedSettled.mockReturnValue(true);
	});

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

describe("VideoCard — choreografia jak w feedzie (#147)", () => {
	beforeEach(() => {
		mockedSettled.mockReset();
	});

	it("etapy mają kolejność feedu: text → media", () => {
		expect(VIDEO_CARD_STAGES).toEqual(["text", "media"]);
	});

	it("zimny start (boot nie osiadł): szkielet tytułu, miniatura pod placeholderem", () => {
		mockedSettled.mockReturnValue(false);
		const { container } = render(<VideoCard video={video} />);

		expect(screen.queryByText("Wakacje nad morzem")).toBeNull();
		expect(screen.queryByText("Kasia")).toBeNull();
		expect(screen.getByTestId("skeleton-video-text")).toBeTruthy();

		const overlay = container.querySelector(".fade-image-placeholder");
		expect(overlay?.getAttribute("data-revealed")).toBe("false");
	});

	it("warm: tekst od razu; miniatura wygasa po załadowaniu (etap media)", () => {
		mockedSettled.mockReturnValue(true);
		const { container } = render(<VideoCard video={video} />);

		expect(screen.getByText("Wakacje nad morzem")).toBeTruthy();
		expect(screen.getByText("Kasia")).toBeTruthy();

		const img = screen.getByRole("img");
		const overlay = container.querySelector(".fade-image-placeholder");
		expect(overlay?.getAttribute("data-revealed")).toBe("false");

		fireEvent.load(img);
		expect(overlay?.getAttribute("data-revealed")).toBe("true");
	});
});
