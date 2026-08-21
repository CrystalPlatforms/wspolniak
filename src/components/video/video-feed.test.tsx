// SPDX-License-Identifier: AGPL-3.0-or-later

import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import type { VideoFeedItem } from "@/db/videos";
import { VideoFeed } from "./video-feed";

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

function makeVideo(id: string): VideoFeedItem {
	return {
		id,
		youtubeVideoId: `yt-${id}`,
		title: `Wideo ${id}`,
		description: null,
		authorId: "u1",
		thumbnailUrl: `https://i.ytimg.com/${id}.jpg`,
		createdAt: new Date("2026-07-27T12:00:00Z"),
		author: { id: "u1", name: "Kasia" },
	};
}

const noop = () => {};

describe("VideoFeed", () => {
	it("isPending: tyle szkieletów, ile kart na stronie (mirror feedu #147)", () => {
		render(
			<VideoFeed
				videos={[]}
				hasNextPage={false}
				isFetchingNextPage={false}
				onLoadMore={noop}
				isPending
			/>,
		);

		const skeletons = screen.getAllByTestId("video-card-skeleton");
		expect(skeletons).toHaveLength(12);
		// mylący empty state dopiero po osiadnięciu danych
		expect(screen.queryByText("Brak wideo")).toBeNull();
	});

	it("shows empty state when there are no videos", () => {
		render(
			<VideoFeed videos={[]} hasNextPage={false} isFetchingNextPage={false} onLoadMore={noop} />,
		);

		expect(screen.getByText("Brak wideo")).toBeTruthy();
	});

	it("renders a card per video", () => {
		render(
			<VideoFeed
				videos={[makeVideo("v-1"), makeVideo("v-2")]}
				hasNextPage={false}
				isFetchingNextPage={false}
				onLoadMore={noop}
			/>,
		);

		expect(screen.getAllByRole("link")).toHaveLength(2);
	});

	it("shows a load-more button when more pages exist and calls onLoadMore on click", () => {
		const onLoadMore = vi.fn();
		render(
			<VideoFeed
				videos={[makeVideo("v-1")]}
				hasNextPage
				isFetchingNextPage={false}
				onLoadMore={onLoadMore}
			/>,
		);

		const button = screen.getByRole("button", { name: /załaduj więcej/i });
		fireEvent.click(button);

		expect(onLoadMore).toHaveBeenCalledOnce();
	});

	it("shows the end marker when no more pages remain", () => {
		render(
			<VideoFeed
				videos={[makeVideo("v-1")]}
				hasNextPage={false}
				isFetchingNextPage={false}
				onLoadMore={noop}
			/>,
		);

		expect(screen.getByText("Koniec")).toBeTruthy();
	});
});
