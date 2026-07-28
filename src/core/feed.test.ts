// SPDX-License-Identifier: AGPL-3.0-or-later
vi.mock("@/db/posts", () => ({
	listPaginatedPosts: vi.fn(),
	listPostsByIds: vi.fn(),
}));
vi.mock("@/db/pinned-posts", () => ({
	listPinnedPostIds: vi.fn(),
}));
vi.mock("@/db/comments", () => ({
	countCommentsByPosts: vi.fn(),
}));
vi.mock("@/db/videos", () => ({
	listVideosByPostIds: vi.fn(),
}));

import { countCommentsByPosts } from "@/db/comments";
import { listPinnedPostIds } from "@/db/pinned-posts";
import { listPaginatedPosts, listPostsByIds, type PostWithAuthorAndImages } from "@/db/posts";
import { listVideosByPostIds, type PostVideo } from "@/db/videos";
import { assembleFeedPage, type FeedPageData } from "./feed";

const mockedPaginated = vi.mocked(listPaginatedPosts);
const mockedByIds = vi.mocked(listPostsByIds);
const mockedPinnedIds = vi.mocked(listPinnedPostIds);
const mockedCommentCounts = vi.mocked(countCommentsByPosts);
const mockedVideos = vi.mocked(listVideosByPostIds);

function makePost(id: string, createdAt: Date): PostWithAuthorAndImages {
	return {
		id,
		authorId: "user-1",
		description: `post ${id}`,
		createdAt,
		updatedAt: createdAt,
		author: { id: "user-1", name: "Ania" },
		images: [],
	};
}

const NOW = new Date("2026-07-01T10:00:00.000Z");

beforeEach(() => {
	vi.clearAllMocks();
	mockedPinnedIds.mockResolvedValue([]);
	mockedVideos.mockResolvedValue(new Map());
});

describe("assembleFeedPage", () => {
	it("zwraca przypięte posty na górze, potem chronologiczne, z licznikami komentarzy", async () => {
		mockedPinnedIds.mockResolvedValue(["pin-1"]);
		mockedByIds.mockResolvedValue([makePost("pin-1", NOW)]);
		mockedPaginated.mockResolvedValue({
			posts: [makePost("chrono-1", NOW)],
			nextCursor: null,
		});
		mockedCommentCounts.mockResolvedValue(
			new Map([
				["pin-1", 3],
				["chrono-1", 0],
			]),
		);

		const result: FeedPageData = await assembleFeedPage({
			cursor: undefined,
			imageAccountHash: "hash-abc",
		});

		expect(result.data[0]?.id).toBe("pin-1");
		expect(result.data[0]?.pinned).toBe(true);
		expect(result.data[0]?.commentCount).toBe(3);
		expect(result.data[1]?.id).toBe("chrono-1");
		expect(result.data[1]?.pinned).toBeUndefined();
		expect(result.meta.imageAccountHash).toBe("hash-abc");
	});

	it("nie pobiera przypiętych postów gdy podany jest cursor (druga i kolejne strony)", async () => {
		mockedPinnedIds.mockResolvedValue(["pin-1"]);
		mockedPaginated.mockResolvedValue({
			posts: [makePost("chrono-1", NOW)],
			nextCursor: null,
		});
		mockedCommentCounts.mockResolvedValue(new Map());

		await assembleFeedPage({
			cursor: { createdAt: "2026-07-01T10:00:00.000Z", id: "x" },
			imageAccountHash: "hash-abc",
		});

		expect(mockedByIds).not.toHaveBeenCalled();
	});

	it("wyklucza przypięte posty z chronologii (excludeIds)", async () => {
		mockedPinnedIds.mockResolvedValue(["pin-1"]);
		mockedByIds.mockResolvedValue([makePost("pin-1", NOW)]);
		mockedPaginated.mockResolvedValue({ posts: [], nextCursor: null });
		mockedCommentCounts.mockResolvedValue(new Map());

		await assembleFeedPage({ cursor: undefined, imageAccountHash: "hash-abc" });

		expect(mockedPaginated).toHaveBeenCalledWith(
			expect.objectContaining({ excludeIds: ["pin-1"], limit: 10 }),
		);
	});

	it("działa gdy brak przypiętych postów — nie woła listPostsByIds", async () => {
		mockedPaginated.mockResolvedValue({
			posts: [makePost("chrono-1", NOW)],
			nextCursor: null,
		});
		mockedCommentCounts.mockResolvedValue(new Map());

		const result = await assembleFeedPage({ cursor: undefined, imageAccountHash: "hash-abc" });

		expect(mockedByIds).not.toHaveBeenCalled();
		expect(result.data).toHaveLength(1);
		expect(result.data[0]?.pinned).toBeUndefined();
	});

	it("przekazuje nextCursor z paginacji do meta", async () => {
		mockedPaginated.mockResolvedValue({
			posts: [makePost("chrono-1", NOW)],
			nextCursor: { createdAt: "2026-06-30T00:00:00.000Z", id: "abc" },
		});
		mockedCommentCounts.mockResolvedValue(new Map());

		const result = await assembleFeedPage({ cursor: undefined, imageAccountHash: "hash-abc" });

		expect(result.meta.nextCursor).toEqual({ createdAt: "2026-06-30T00:00:00.000Z", id: "abc" });
	});

	it("dokleja commentCount = 0 gdy brak wpisu w mapie liczników", async () => {
		mockedPaginated.mockResolvedValue({
			posts: [makePost("chrono-1", NOW)],
			nextCursor: null,
		});
		mockedCommentCounts.mockResolvedValue(new Map()); // pusta mapa

		const result = await assembleFeedPage({ cursor: undefined, imageAccountHash: "hash-abc" });

		expect(result.data[0]?.commentCount).toBe(0);
	});

	it("dokleja wideo przypięte do postów w jednym batchu (no waterfall)", async () => {
		const video: PostVideo = {
			id: "vid-1",
			youtubeVideoId: "yt-1",
			title: "Wakacje",
			description: null,
			authorId: "user-1",
			thumbnailUrl: "https://i.ytimg.com/v/yt-1/default.jpg",
			createdAt: NOW,
			position: 0,
			author: { id: "user-1", name: "Ania" },
		};
		mockedPaginated.mockResolvedValue({
			posts: [makePost("chrono-1", NOW)],
			nextCursor: null,
		});
		mockedCommentCounts.mockResolvedValue(new Map());
		mockedVideos.mockResolvedValue(new Map([["chrono-1", [video]]]));

		const result = await assembleFeedPage({ cursor: undefined, imageAccountHash: "hash-abc" });

		// batch wołany raz ze wszystkimi id postów
		expect(mockedVideos).toHaveBeenCalledWith(["chrono-1"]);
		expect(result.data[0]?.videos).toHaveLength(1);
		expect(result.data[0]?.videos[0]?.youtubeVideoId).toBe("yt-1");
	});
});
