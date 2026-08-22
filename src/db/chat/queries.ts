// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { asc, eq, gt } from "drizzle-orm";
import { users } from "@/db/identity/table";
import { getDb } from "@/db/setup";
import { chatMessages } from "./table";

export type ChatMessage = InferSelectModel<typeof chatMessages>;

/** Wiadomość czatu z nazwą autora (join z users) — kształt zwracany przez API. */
export interface ChatMessageWithAuthor {
	id: string;
	authorId: string;
	text: string;
	replyToId: string | null;
	replyText: string | null;
	createdAt: Date;
	expiresAt: Date;
	author: { id: string; name: string };
}

export async function createChatMessage(input: {
	authorId: string;
	text: string;
}): Promise<ChatMessage> {
	const rows = await getDb()
		.insert(chatMessages)
		.values({ id: crypto.randomUUID(), ...input })
		.returning();

	const row = rows[0];
	if (!row) throw new Error("createChatMessage: insert returned no rows");
	return row;
}

/** Wiadomości z ostatnich 24h z autorami, chronologicznie. Zawsze filtruje expires_at > now(). */
export async function listChatMessages(): Promise<ChatMessageWithAuthor[]> {
	const rows = await getDb()
		.select({
			message: chatMessages,
			author: { id: users.id, name: users.name },
		})
		.from(chatMessages)
		.leftJoin(users, eq(chatMessages.authorId, users.id))
		.where(gt(chatMessages.expiresAt, new Date()))
		.orderBy(asc(chatMessages.createdAt));

	return rows.map((row) => ({
		id: row.message.id,
		authorId: row.message.authorId,
		text: row.message.text,
		replyToId: row.message.replyToId,
		replyText: row.message.replyText,
		createdAt: row.message.createdAt,
		expiresAt: row.message.expiresAt,
		author: { id: row.author?.id ?? "", name: row.author?.name ?? "" },
	}));
}
