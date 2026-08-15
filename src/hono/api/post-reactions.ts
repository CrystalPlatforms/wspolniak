// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	deleteReaction,
	getReactionCounts,
	getReactionsWithUsers,
	getUserReaction,
	type ReactionTarget,
	upsertReaction,
} from "@/db/post-reactions/queries";
import { upsertReactionSchema } from "@/db/post-reactions/schema";
import type { ReactionType } from "@/db/post-reactions/table";
import { getPostById } from "@/db/posts/queries";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const reactionsEndpoint = createHono();

reactionsEndpoint.use("*", authMiddleware());

function countsToRecord(countsMap: Map<string, number>): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const [type, count] of countsMap) {
		counts[type] = count;
	}
	return counts;
}

async function parseReactionBody(
	body: unknown,
): Promise<
	{ ok: true; reactionType: ReactionType } | { ok: false; status: 400; details: unknown }
> {
	const result = upsertReactionSchema.safeParse(body);
	if (!result.success) {
		return { ok: false, status: 400, details: result.error.flatten() };
	}
	return { ok: true, reactionType: result.data.reactionType };
}

reactionsEndpoint.post("/:postId/reactions", async (c) => {
	const user = c.get("user");
	const postId = c.req.param("postId");

	const post = await getPostById(postId);
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	const parsed = await parseReactionBody(await c.req.json());
	if (!parsed.ok) {
		return c.json({ error: "Validation failed", details: parsed.details }, parsed.status);
	}

	const reaction = await upsertReaction({
		target: { kind: "post", postId },
		userId: user.userId,
		reactionType: parsed.reactionType,
	});

	return c.json({ data: reaction });
});

reactionsEndpoint.delete("/:postId/reactions", async (c) => {
	const user = c.get("user");
	const postId = c.req.param("postId");

	const post = await getPostById(postId);
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	const existed = await deleteReaction({ kind: "post", postId }, user.userId);

	return c.json({ data: { removed: existed } });
});

reactionsEndpoint.get("/:postId/reactions", async (c) => {
	const postId = c.req.param("postId");

	const post = await getPostById(postId);
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	const countsMap = await getReactionCounts({ kind: "post", postId });
	return c.json({ data: countsToRecord(countsMap) });
});

reactionsEndpoint.get("/:postId/my-reaction", async (c) => {
	const user = c.get("user");
	const postId = c.req.param("postId");

	const post = await getPostById(postId);
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	const reaction = await getUserReaction({ kind: "post", postId }, user.userId);
	return c.json({ data: reaction });
});

reactionsEndpoint.get("/:postId/reactions/users", async (c) => {
	const postId = c.req.param("postId");

	const post = await getPostById(postId);
	if (!post) {
		return c.json({ error: "Not found" }, 404);
	}

	const reactions = await getReactionsWithUsers({ kind: "post", postId });
	return c.json({ data: reactions });
});

function commentTarget(postId: string, commentId: string): ReactionTarget {
	return { kind: "comment", postId, commentId };
}

reactionsEndpoint.post("/:postId/comments/:commentId/reactions", async (c) => {
	const user = c.get("user");
	const postId = c.req.param("postId");
	const commentId = c.req.param("commentId");

	const parsed = await parseReactionBody(await c.req.json());
	if (!parsed.ok) {
		return c.json({ error: "Validation failed", details: parsed.details }, parsed.status);
	}

	const reaction = await upsertReaction({
		target: commentTarget(postId, commentId),
		userId: user.userId,
		reactionType: parsed.reactionType,
	});

	return c.json({ data: reaction });
});

reactionsEndpoint.delete("/:postId/comments/:commentId/reactions", async (c) => {
	const user = c.get("user");
	const postId = c.req.param("postId");
	const commentId = c.req.param("commentId");

	const existed = await deleteReaction(commentTarget(postId, commentId), user.userId);

	return c.json({ data: { removed: existed } });
});

reactionsEndpoint.get("/:postId/comments/:commentId/reactions", async (c) => {
	const postId = c.req.param("postId");
	const commentId = c.req.param("commentId");

	const countsMap = await getReactionCounts(commentTarget(postId, commentId));
	return c.json({ data: countsToRecord(countsMap) });
});

reactionsEndpoint.get("/:postId/comments/:commentId/my-reaction", async (c) => {
	const user = c.get("user");
	const postId = c.req.param("postId");
	const commentId = c.req.param("commentId");

	const reaction = await getUserReaction(commentTarget(postId, commentId), user.userId);
	return c.json({ data: reaction });
});

reactionsEndpoint.get("/:postId/comments/:commentId/reactions/users", async (c) => {
	const postId = c.req.param("postId");
	const commentId = c.req.param("commentId");

	const reactions = await getReactionsWithUsers(commentTarget(postId, commentId));
	return c.json({ data: reactions });
});

export default reactionsEndpoint;
