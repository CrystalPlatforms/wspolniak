// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (F1 #152):
// - createChatMessage przyjmuje {authorId, text} i generuje id (crypto.randomUUID);
//   expires_at ustawia baza (default now() + interval '24 hours' — PRD czatu).
// - listChatMessages zwraca wiadomości z ostatnich 24h (filtr expires_at > now()
//   zawsze w SQL) z dołączonym autorem {id, name}, posortowane ASC po created_at.
//
// Założenia kontraktu reakcji (F4 #155, poprawka po HITL: limit JEDNA reakcja
// na usera na wiadomość — jak w feedzie):
// - toggleChatReaction delete-first: kasuje wiersz usera dla wiadomości (DOWOLNY
//   typ); ten sam typ → "removed"; inny typ → "replaced" (previous = stary typ,
//   INSERT nowego); brak → "added". onConflictDoNothing — UNIQUE(message,user)
//   nigdy nie wycieka błędem.
// - listChatReactions: reakcje NIEWYGAŚNIĘTYCH wiadomości (inner join + expires_at
//   > now() w SQL) z imionami userów (leftJoin; null → user null).
import {
	type ChatMessageWithAuthor,
	type ChatReactionWithUser,
	createChatMessage,
	listChatMessages,
	listChatReactions,
	toggleChatReaction,
} from "./queries";
import { chatMessages, chatReactions } from "./table";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

const now = new Date();
const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

function mockMessage(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "msg-1",
		authorId: "user-1",
		text: "Cześć rodzeństwo!",
		replyToId: null,
		replyText: null,
		createdAt: now,
		expiresAt: in24h,
		...overrides,
	};
}

describe("createChatMessage", () => {
	it("inserts a message with a generated id and returns it", async () => {
		const mock = mockMessage();
		const mockReturning = vi.fn().mockResolvedValue([mock]);
		const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
		mockGetDb.mockReturnValue({ insert: mockInsert } as never);

		const result = await createChatMessage({ authorId: "user-1", text: "Cześć rodzeństwo!" });

		expect(result.id).toBe("msg-1");
		expect(result.authorId).toBe("user-1");
		expect(result.text).toBe("Cześć rodzeństwo!");
		expect(mockInsert).toHaveBeenCalledWith(chatMessages);
		const insertedValues = mockValues.mock.calls[0]?.[0];
		expect(insertedValues).toMatchObject({
			authorId: "user-1",
			text: "Cześć rodzeństwo!",
		});
		// id generowane po stronie domeny (konwencja jak comments/bookmarks).
		expect(insertedValues?.id).toEqual(expect.any(String));
	});
});

describe("listChatMessages", () => {
	function mockSelectChain(mockRows: unknown[]) {
		const mockOrderBy = vi.fn().mockResolvedValue(mockRows);
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
		const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
		return { mockWhere };
	}

	it("returns messages with author names in chronological order", async () => {
		const older = new Date(now.getTime() - 60_000);
		mockSelectChain([
			{
				message: mockMessage({ id: "m-1", createdAt: older }),
				author: { id: "user-1", name: "Tomek" },
			},
			{
				message: mockMessage({ id: "m-2", authorId: "user-2", createdAt: now }),
				author: { id: "user-2", name: "Kasia" },
			},
		]);

		const result = await listChatMessages();

		const expected: ChatMessageWithAuthor[] = [
			{
				id: "m-1",
				authorId: "user-1",
				text: "Cześć rodzeństwo!",
				replyToId: null,
				replyText: null,
				createdAt: older,
				expiresAt: in24h,
				author: { id: "user-1", name: "Tomek" },
			},
			{
				id: "m-2",
				authorId: "user-2",
				text: "Cześć rodzeństwo!",
				replyToId: null,
				replyText: null,
				createdAt: now,
				expiresAt: in24h,
				author: { id: "user-2", name: "Kasia" },
			},
		];
		expect(result).toEqual(expected);
	});

	it("always filters expired rows out in SQL (expires_at > now)", async () => {
		// Nie da się „zasiać" prawdziwego wygasłego wiersza w testach jednostkowych
		// (projekt mockuje getDb), więc asertujemy kontrakt SQL: warunek WHERE
		// jest zbudowany na kolumnie expires_at z parametrem-Datą ≈ teraz.
		const { mockWhere } = mockSelectChain([]);

		await listChatMessages();

		const cond = mockWhere.mock.calls[0]?.[0] as
			| { queryChunks?: { name?: string; value?: unknown }[] }
			| undefined;
		const chunks = cond?.queryChunks ?? [];
		expect(chunks.find((chunk) => chunk?.name === "expires_at")).toBeDefined();
		const dateParam = chunks.find((chunk) => chunk?.value instanceof Date)?.value as Date;
		expect(Math.abs(Date.now() - dateParam.getTime())).toBeLessThan(5_000);
	});
});

describe("toggleChatReaction (F4 #155 — jedna reakcja per user)", () => {
	function mockToggleDb(deletedRows: unknown[]) {
		const mockReturning = vi.fn().mockResolvedValue(deletedRows);
		const mockDeleteWhere = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

		const mockOnConflict = vi.fn().mockResolvedValue(undefined);
		const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
		const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

		mockGetDb.mockReturnValue({ delete: mockDelete, insert: mockInsert } as never);
		return { mockDelete, mockInsert, mockValues, mockOnConflict };
	}

	it("removes the reaction when the user taps their only (same-type) reaction", async () => {
		const { mockDelete, mockInsert } = mockToggleDb([
			{ id: "r-1", messageId: "m-1", userId: "u1", reaction: "heart" },
		]);

		const result = await toggleChatReaction({
			messageId: "m-1",
			userId: "u1",
			reaction: "heart",
		});

		expect(result).toEqual({ action: "removed", reaction: "heart" });
		expect(mockDelete).toHaveBeenCalledWith(chatReactions);
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it("adds the reaction with a generated id when the user has none", async () => {
		const { mockValues } = mockToggleDb([]);

		const result = await toggleChatReaction({
			messageId: "m-1",
			userId: "u1",
			reaction: "flame",
		});

		expect(result).toEqual({ action: "added", reaction: "flame" });
		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({ messageId: "m-1", userId: "u1", reaction: "flame" }),
		);
		const inserted = mockValues.mock.calls[0]?.[0] as { id?: string };
		expect(inserted.id).toEqual(expect.any(String));
	});

	it("replaces a different reaction type instead of allowing a second one", async () => {
		const { mockValues } = mockToggleDb([
			{ id: "r-1", messageId: "m-1", userId: "u1", reaction: "heart" },
		]);

		const result = await toggleChatReaction({
			messageId: "m-1",
			userId: "u1",
			reaction: "laugh",
		});

		expect(result).toEqual({ action: "replaced", reaction: "laugh", previous: "heart" });
		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({ messageId: "m-1", userId: "u1", reaction: "laugh" }),
		);
	});

	it("swallows the UNIQUE(message,user) conflict on insert instead of leaking an error", async () => {
		// Wyścig: delete nic nie usunął, a wiersz istnieje — onConflictDoNothing
		// gwarantuje brak błędu.
		const { mockOnConflict } = mockToggleDb([]);

		await expect(
			toggleChatReaction({ messageId: "m-1", userId: "u1", reaction: "laugh" }),
		).resolves.toEqual({ action: "added", reaction: "laugh" });
		expect(mockOnConflict).toHaveBeenCalled();
	});
});

describe("listChatReactions (F4 #155)", () => {
	function mockReactionsSelectChain(mockRows: unknown[]) {
		const mockWhere = vi.fn().mockResolvedValue(mockRows);
		const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
		const mockInnerJoin = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
		const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);
		return { mockWhere, mockInnerJoin };
	}

	it("returns reactions of unexpired messages with user names", async () => {
		mockReactionsSelectChain([
			{
				reaction: { messageId: "m-1", userId: "u1", reaction: "heart" },
				userName: "Tomek",
			},
			{
				reaction: { messageId: "m-1", userId: "u2", reaction: "heart" },
				userName: null,
			},
		]);

		const result = await listChatReactions();

		const expected: ChatReactionWithUser[] = [
			{ messageId: "m-1", userId: "u1", reaction: "heart", user: { id: "u1", name: "Tomek" } },
			{ messageId: "m-1", userId: "u2", reaction: "heart", user: null },
		];
		expect(result).toEqual(expected);
	});

	it("always filters reactions of expired messages out in SQL (join + expires_at > now)", async () => {
		const { mockWhere, mockInnerJoin } = mockReactionsSelectChain([]);

		await listChatReactions();

		// Inner join z chat_messages — reakcje wygasłych wiadomości nie istnieją.
		expect(mockInnerJoin).toHaveBeenCalledWith(chatMessages, expect.anything());
		const cond = mockWhere.mock.calls[0]?.[0] as
			| { queryChunks?: { name?: string; value?: unknown }[] }
			| undefined;
		const chunks = cond?.queryChunks ?? [];
		expect(chunks.find((chunk) => chunk?.name === "expires_at")).toBeDefined();
		const dateParam = chunks.find((chunk) => chunk?.value instanceof Date)?.value as Date;
		expect(Math.abs(Date.now() - dateParam.getTime())).toBeLessThan(5_000);
	});
});
