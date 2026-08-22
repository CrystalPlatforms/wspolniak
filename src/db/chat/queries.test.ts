// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (F1 #152):
// - createChatMessage przyjmuje {authorId, text} i generuje id (crypto.randomUUID);
//   expires_at ustawia baza (default now() + interval '24 hours' — PRD czatu).
// - listChatMessages zwraca wiadomości z ostatnich 24h (filtr expires_at > now()
//   zawsze w SQL) z dołączonym autorem {id, name}, posortowane ASC po created_at.
// - W F1 domena nie obsługuje reply ani reakcji (kolumny/tabele istnieją w 0025).
import { type ChatMessageWithAuthor, createChatMessage, listChatMessages } from "./queries";
import { chatMessages } from "./table";

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
