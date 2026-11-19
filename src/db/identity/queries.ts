// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { generateToken } from "./crypto";
import { users } from "./table";

export type User = InferSelectModel<typeof users>;

interface CreateUserInput {
	name: string;
	role: string;
	tokenHash: string;
}

export async function createUser(input: CreateUserInput) {
	const id = crypto.randomUUID();
	const rows = await getDb()
		.insert(users)
		.values({ id, ...input })
		.returning();
	const row = rows[0];
	if (!row) throw new Error("createUser: insert returned no rows");
	return row;
}

export async function createMember(name: string) {
	const { plaintext, hash } = await generateToken();
	const user = await createUser({ name, role: "member", tokenHash: hash });
	return { user, plaintextToken: plaintext };
}

export async function listActiveMembers(): Promise<User[]> {
	return getDb().select().from(users).where(isNull(users.deletedAt)).orderBy(asc(users.createdAt));
}

export async function regenerateMemberToken(userId: string) {
	const { plaintext, hash } = await generateToken();
	await getDb().update(users).set({ tokenHash: hash }).where(eq(users.id, userId));
	return { plaintextToken: plaintext };
}

export async function softDeleteMember(userId: string) {
	await getDb().update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
}

export async function updateMemberName(userId: string, name: string): Promise<User> {
	const rows = await getDb().update(users).set({ name }).where(eq(users.id, userId)).returning();
	const row = rows[0];
	if (!row) throw new Error("updateMemberName: update returned no rows");
	return row;
}

export async function findActiveUserById(id: string): Promise<User | null> {
	const rows = await getDb()
		.select()
		.from(users)
		.where(and(eq(users.id, id), isNull(users.deletedAt)));
	return rows[0] ?? null;
}

export async function findUserByTokenHash(tokenHash: string): Promise<User | null> {
	const rows = await getDb()
		.select()
		.from(users)
		.where(and(eq(users.tokenHash, tokenHash), isNull(users.deletedAt)));
	return rows[0] ?? null;
}

/**
 * Jedyny aktywny admin (role='admin', niezablokowany). Używane przez cron
 * kalendarza jako autor postów "D-0". Brak admina → null (bieg pomijany).
 */
export async function getActiveAdmin(): Promise<User | null> {
	const rows = await getDb()
		.select()
		.from(users)
		.where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
		.limit(1);
	return rows[0] ?? null;
}

export interface MemberOption {
	id: string;
	name: string;
}

/**
 * Aktywni członkowie do dropdownu @mention. Opcjonalnie filtrowani po imieniu
 * (case-insensitive, contains). Limit 20 — dropdown pokazuje pierwsze trafienia,
 * co wystarcza dla rodzinnej apki i chroni przed过度 dużym payloadem.
 */
export async function listMembersForMentions(query?: string): Promise<MemberOption[]> {
	const trimmed = query?.trim() ?? "";
	const condition = trimmed
		? and(isNull(users.deletedAt), ilike(users.name, `%${trimmed}%`))
		: isNull(users.deletedAt);

	return getDb()
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(condition)
		.orderBy(asc(users.name))
		.limit(20);
}
