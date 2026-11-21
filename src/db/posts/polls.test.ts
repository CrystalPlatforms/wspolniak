// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu voteOnPostPoll (#241, spisane przed testami):
// - zmiana głosu = atomowy upsert po UNIQUE(post_id, user_id) — na głosującego
//   przypada zawsze dokładnie 1 wiersz (onConflictDoUpdate, bez read-before-write);
// - klik w TĘ SAMĄ opcję jest idempotentny (posty nie mają wycofywania głosu —
//   decyzja PRD #240, inaczej niż w czacie);
// - brak posta / usunięty post → 404, post bez ankiety → 400, indeks poza
//   zakresem opcji → 400;
// - odpowiedź to wyłącznie {counts, myVoteIndex} — nigdy id/nazwy głosujących.
// - getPostPollResults agreguje COUNT GROUP BY po stronie serwera; uszkodzony
//   payload ankiety nie wysypuje batcha.
import { getPostPollResults, voteOnPostPoll } from "./polls";
import { postPollVotes } from "./table";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

/**
 * Minimalny fluent fake drizzle'a: kolejne wywołania terminalne (limit/groupBy/
 * onConflictDoUpdate/returning) zjadają kolejne wyniki z kolejki `results`.
 */
function chainDb(results: unknown[]) {
	const next = () => Promise.resolve(results.shift());
	const build = () => {
		const chain: Record<string, unknown> = {};
		chain.select = vi.fn(() => chain);
		chain.from = vi.fn(() => chain);
		chain.where = vi.fn(() => chain);
		chain.limit = vi.fn(() => next());
		chain.groupBy = vi.fn(() => next());
		chain.insert = vi.fn(() => chain);
		chain.values = vi.fn(() => chain);
		chain.onConflictDoUpdate = vi.fn(() => next());
		chain.onConflictDoNothing = vi.fn(() => next());
		// Kwerendy bez terminala (np. select...where bez groupBy) drizzle realizuje
		// awaitem buildera — fake robi to samo przez thenable.
		Object.assign(chain, {
			// biome-ignore lint/suspicious/noThenProperty: celowa emulacja thenable builderów drizzle
			then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(next()).then(onFulfilled),
		});
		return chain;
	};
	const chain = build();
	mockGetDb.mockReturnValue(chain as never);
	return chain;
}

const POLL = { question: "Dokąd na wakacje?", options: ["Morze", "Góry", "Jezioro"] };

describe("voteOnPostPoll", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("oddaje głos: upsert po (post_id, user_id) i liczniki z akcją opcji", async () => {
		const chain = chainDb([[{ poll: POLL }], [], []]);

		const result = await voteOnPostPoll("post-1", "user-1", 1);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toEqual({ counts: [0, 0, 0], myVoteIndex: 1 });
		expect(chain.onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				target: [postPollVotes.postId, postPollVotes.userId],
			}),
		);
	});

	it("zmiana głosu trafia w ten sam konflikt targetu (atomic upsert, nigdy 2 wiersze)", async () => {
		const chain = chainDb([[{ poll: POLL }], [], []]);
		await voteOnPostPoll("post-1", "user-1", 2);
		// values() dostało świeży UUID + indeks nowej opcji; target = para (post, user).
		expect(chain.values).toHaveBeenCalledWith(
			expect.objectContaining({ postId: "post-1", userId: "user-1", optionIndex: 2 }),
		);
		expect(chain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
	});

	it("ponowny klik w tę samą opcję jest idempotentny (bez wycofywania — PRD #240)", async () => {
		const chain = chainDb([[{ poll: POLL }], [], []]);
		const result = await voteOnPostPoll("post-1", "user-1", 0);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.myVoteIndex).toBe(0);
		expect(chain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
	});

	it("404 gdy post nie istnieje", async () => {
		chainDb([[]]);
		const result = await voteOnPostPoll("ghost", "user-1", 0);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(404);
	});

	it("400 gdy post nie ma ankiety", async () => {
		chainDb([[{ poll: null }]]);
		const result = await voteOnPostPoll("post-1", "user-1", 0);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(400);
	});

	it("400 gdy indeks poza zakresem opcji", async () => {
		chainDb([[{ poll: POLL }]]);
		const result = await voteOnPostPoll("post-1", "user-1", 3);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(400);
	});

	it("400 gdy payload ankiety jest uszkodzony", async () => {
		chainDb([[{ poll: { question: "", options: [] } }]]);
		const result = await voteOnPostPoll("post-1", "user-1", 0);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(400);
	});
});

describe("getPostPollResults", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("agreguje liczniki po opcjach i dokleja głos widza", async () => {
		const chain = chainDb([
			// pierwszy select: COUNT GROUP BY (post_id, option_index)
			[
				{ postId: "post-1", optionIndex: 0, votes: 2 },
				{ postId: "post-1", optionIndex: 2, votes: 1 },
			],
			// drugi select: głosy widza
			[{ postId: "post-1", optionIndex: 0 }],
		]);

		const results = await getPostPollResults([{ postId: "post-1", poll: POLL }], "user-1");

		expect(chain.groupBy).toHaveBeenCalledTimes(1);
		expect(results.get("post-1")).toEqual({ counts: [2, 0, 1], myVoteIndex: 0 });
	});

	it("bez widza liczniki są, myVoteIndex null", async () => {
		chainDb([[{ postId: "post-1", optionIndex: 1, votes: 3 }], []]);
		const results = await getPostPollResults([{ postId: "post-1", poll: POLL }], null);
		expect(results.get("post-1")).toEqual({ counts: [0, 3, 0], myVoteIndex: null });
	});

	it("posty bez ankiety nie trafiają do wyniku (i nie odpytują głosów)", async () => {
		const chain = chainDb([[], []]);
		const results = await getPostPollResults([{ postId: "post-1", poll: null }], "user-1");
		expect(results.size).toBe(0);
		expect(chain.groupBy).not.toHaveBeenCalled();
	});

	it("uszkodzony payload ankiety nie wysypuje batcha", async () => {
		chainDb([[], []]);
		const results = await getPostPollResults(
			[{ postId: "post-1", poll: { question: "", options: [] } }],
			"user-1",
		);
		expect(results.size).toBe(0);
	});
});
