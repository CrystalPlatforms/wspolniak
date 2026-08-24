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
	deleteChatMessage,
	deleteExpiredChatMessages,
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

// Założenia kontraktu reply (F5 #156):
// - replyToId wskazuje ŻYWY oryginał (id + expires_at > now w SQL); tekst
//   oryginału jest snapshottowany do reply_text przy wysyłce — quote przeżywa
//   wygaśnięcie/usunięcie oryginału.
// - Brak/brak życia oryginału → AppError 400 (VALIDATION) zanim cokolwiek wstawi.
// - Zwykła wiadomość nie robi lookupu oryginału; reply_text = null.
describe("createChatMessage — reply (F5 #156)", () => {
	function mockReplyDb(originalRows: unknown[], inserted: unknown) {
		const mockLimit = vi.fn().mockResolvedValue(originalRows);
		const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		const mockReturning = vi.fn().mockResolvedValue([inserted]);
		const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
		mockGetDb.mockReturnValue({ select: mockSelect, insert: mockInsert } as never);
		return { mockValues, mockInsert };
	}

	it("snapshots the live original's text into replyText at send time", async () => {
		const inserted = mockMessage({ id: "m-2", replyToId: "m-1", replyText: "Oryginał" });
		const { mockValues } = mockReplyDb([{ text: "Oryginał" }], inserted);

		const result = await createChatMessage({
			authorId: "user-1",
			text: "Odpowiedź",
			replyToId: "m-1",
		});

		expect(result.replyToId).toBe("m-1");
		expect(result.replyText).toBe("Oryginał");
		expect(mockValues.mock.calls[0]?.[0]).toMatchObject({
			replyToId: "m-1",
			replyText: "Oryginał",
		});
	});

	it("rejects a reply to a nonexistent/expired original with AppError 400 (no insert)", async () => {
		const { mockInsert } = mockReplyDb([], mockMessage());

		await expect(
			createChatMessage({ authorId: "user-1", text: "Odpowiedź", replyToId: "gone" }),
		).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it("skips the original lookup entirely for a plain message", async () => {
		const mockReturning = vi.fn().mockResolvedValue([mockMessage()]);
		const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
		const mockSelect = vi.fn();
		mockGetDb.mockReturnValue({ select: mockSelect, insert: mockInsert } as never);

		await createChatMessage({ authorId: "user-1", text: "Zwykła" });

		expect(mockSelect).not.toHaveBeenCalled();
		const insertedValues = mockValues.mock.calls[0]?.[0] as { replyText: string | null };
		expect(insertedValues.replyText).toBeNull();
	});
});

// Założenia kontraktu delete (F6 #157):
// - Autoryzacja po stronie domeny: autor LUB admin; Result zamiast throw
//   (404 nie istnieje / 403 cudza wiadomość — bez treści w odpowiedzi).
// - Hard delete wiadomości + reakcji w JEDNYM zapytaniu (CTE) — jeden execute.
//
// Założenia kontraktu expiry (F7 #158):
// - deleteExpiredChatMessages: cron czyszczenia kasuje WIADOMOŚCI z
//   expires_at < now() razem z ich reakcjami w JEDNYM zapytaniu CTE (wzorzec
//   deleteChatMessage); zwraca liczbę skasowanych wiadomości — pod log crona.
//   Read path (GET) zawsze filtruje wygasłe niezależnie od crona (test F1).
describe("deleteExpiredChatMessages (F7 #158)", () => {
	it("hard-deletes expired messages with their reactions in a single query and returns the count", async () => {
		const mockExecute = vi.fn().mockResolvedValue({ rows: [{ deleted: 3 }] });
		mockGetDb.mockReturnValue({ execute: mockExecute } as never);

		const count = await deleteExpiredChatMessages();

		expect(count).toBe(3);
		// Jedno zapytanie CTE — wiadomości i reakcje razem (jeden round-trip).
		expect(mockExecute).toHaveBeenCalledTimes(1);
		// sql`` bez parametrów pakuje tekst w StringChunki — czytamy przez JSON.
		const queryJson = JSON.stringify(mockExecute.mock.calls[0]?.[0]);
		expect(queryJson).toContain("expires_at < now()");
		expect(queryJson).toContain("delete from chat_reactions");
	});

	it("returns 0 when nothing expired", async () => {
		const mockExecute = vi.fn().mockResolvedValue({ rows: [{ deleted: 0 }] });
		mockGetDb.mockReturnValue({ execute: mockExecute } as never);

		await expect(deleteExpiredChatMessages()).resolves.toBe(0);
	});
});

describe("deleteChatMessage (F6 #157)", () => {
	function mockDeleteDb(authorRows: unknown[]) {
		const mockLimit = vi.fn().mockResolvedValue(authorRows);
		const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		const mockExecute = vi.fn().mockResolvedValue(undefined);
		mockGetDb.mockReturnValue({ select: mockSelect, execute: mockExecute } as never);
		return { mockExecute };
	}

	it("returns 404 for a nonexistent message without executing the delete", async () => {
		const { mockExecute } = mockDeleteDb([]);

		const result = await deleteChatMessage({
			id: "gone",
			requesterId: "u1",
			requesterRole: "member",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.status).toBe(404);
		expect(mockExecute).not.toHaveBeenCalled();
	});

	it("rejects another member's delete with 403 (existence not leaked beyond the error)", async () => {
		const { mockExecute } = mockDeleteDb([{ authorId: "u2" }]);

		const result = await deleteChatMessage({
			id: "m-1",
			requesterId: "u1",
			requesterRole: "member",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.status).toBe(403);
		expect(mockExecute).not.toHaveBeenCalled();
	});

	it("hard-deletes the author's own message with its reactions in a single query", async () => {
		const { mockExecute } = mockDeleteDb([{ authorId: "u1" }]);

		const result = await deleteChatMessage({
			id: "m-1",
			requesterId: "u1",
			requesterRole: "member",
		});

		expect(result.ok).toBe(true);
		// Jedno zapytanie CTE kasze wiadomość i reakcje — dokładnie jeden execute.
		expect(mockExecute).toHaveBeenCalledTimes(1);
	});

	it("allows an admin to delete any member's message", async () => {
		const { mockExecute } = mockDeleteDb([{ authorId: "u2" }]);

		const result = await deleteChatMessage({
			id: "m-1",
			requesterId: "u1",
			requesterRole: "admin",
		});

		expect(result.ok).toBe(true);
		expect(mockExecute).toHaveBeenCalledTimes(1);
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
