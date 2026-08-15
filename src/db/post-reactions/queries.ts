// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { getDb } from "@/db/setup";
import type { ReactionType } from "./table";
import { postReactions } from "./table";

export type PostReaction = InferSelectModel<typeof postReactions>;

export type ReactionTarget =
	| { kind: "post"; postId: string }
	| { kind: "comment"; postId: string; commentId: string };

export interface ReactionWithUser {
	id: string;
	postId: string;
	commentId: string | null;
	userId: string;
	reactionType: ReactionType;
	createdAt: Date;
	updatedAt: Date;
	user: {
		name: string;
	} | null;
}

interface UpsertReactionInput {
	target: ReactionTarget;
	userId: string;
	reactionType: ReactionType;
}

function targetCommentId(target: ReactionTarget): string | null {
	return target.kind === "comment" ? target.commentId : null;
}

export async function upsertReaction(input: UpsertReactionInput): Promise<PostReaction> {
	const { target, userId, reactionType } = input;
	const db = getDb();
	const commentId = targetCommentId(target);

	const rows = await db
		.insert(postReactions)
		.values({
			id: crypto.randomUUID(),
			postId: target.postId,
			commentId,
			userId,
			reactionType,
		})
		.onConflictDoUpdate({
			target:
				target.kind === "comment"
					? [postReactions.commentId, postReactions.userId]
					: [postReactions.postId, postReactions.userId],
			targetWhere:
				target.kind === "comment"
					? isNotNull(postReactions.commentId)
					: isNull(postReactions.commentId),
			set: { reactionType, updatedAt: new Date() },
		})
		.returning();

	const row = rows[0];
	if (!row) throw new Error("upsertReaction: no rows returned");
	return row;
}

export async function deleteReaction(target: ReactionTarget, userId: string): Promise<boolean> {
	const db = getDb();

	const rows = await db
		.delete(postReactions)
		.where(and(targetWhere(target), eq(postReactions.userId, userId)))
		.returning();

	return rows.length > 0;
}

function targetWhere(target: ReactionTarget) {
	return target.kind === "post"
		? and(eq(postReactions.postId, target.postId), isNull(postReactions.commentId))
		: eq(postReactions.commentId, target.commentId);
}

export async function getReactionCounts(
	target: ReactionTarget,
): Promise<Map<ReactionType, number>> {
	const db = getDb();

	const rows = await db
		.select({ reactionType: postReactions.reactionType, count: count() })
		.from(postReactions)
		.where(targetWhere(target))
		.groupBy(postReactions.reactionType);

	const result = new Map<ReactionType, number>();
	for (const row of rows) {
		result.set(row.reactionType as ReactionType, row.count);
	}
	return result;
}

export async function getUserReaction(
	target: ReactionTarget,
	userId: string,
): Promise<PostReaction | null> {
	const db = getDb();

	const rows = await db
		.select()
		.from(postReactions)
		.where(and(targetWhere(target), eq(postReactions.userId, userId)));

	return rows[0] ?? null;
}

export async function getReactionsWithUsers(target: ReactionTarget): Promise<ReactionWithUser[]> {
	const db = getDb();

	const rows = await db
		.select({
			id: postReactions.id,
			postId: postReactions.postId,
			commentId: postReactions.commentId,
			userId: postReactions.userId,
			reactionType: postReactions.reactionType,
			createdAt: postReactions.createdAt,
			updatedAt: postReactions.updatedAt,
			userName: users.name,
		})
		.from(postReactions)
		.leftJoin(users, eq(postReactions.userId, users.id))
		.where(targetWhere(target));

	return rows.map((row) => ({
		id: row.id,
		postId: row.postId,
		commentId: row.commentId,
		userId: row.userId,
		reactionType: row.reactionType as ReactionType,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		user: row.userName ? { name: row.userName } : null,
	}));
}
