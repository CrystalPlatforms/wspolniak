// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu chat-polls (F2 #215 + toggle po HITL):
// - Cache CHAT_POLLS_KEY: {myVotes, tallies}; broadcast vote-update nadpisuje
//   CAŁĄ tablicę liczników (serwer wysyła pełne agregaty — brak dryfu).
// - setMyPollVote / clearMyPollVote: optymistyczny zapis/zdjęcie mojego głosu
//   bez ruszania liczników (klik w swoją opcję = wycofanie głosu).
// - parsePollPayload: defensywny Zod — uszkodzony payload → null (fallback UI).
import { QueryClient } from "@tanstack/react-query";
import {
	applyPollVoteUpdate,
	CHAT_POLLS_KEY,
	clearMyPollVote,
	parsePollPayload,
	setMyPollVote,
} from "./chat-polls";

describe("applyPollVoteUpdate", () => {
	it("overwrites the tallies for the message and preserves myVotes", () => {
		const client = new QueryClient();
		client.setQueryData(CHAT_POLLS_KEY, {
			myVotes: { "m-1": 0 },
			tallies: { "m-1": [1, 0], "m-2": [3, 4] },
		});

		applyPollVoteUpdate(client, { messageId: "m-1", tallies: [1, 2] });

		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: { "m-1": 0 },
			tallies: { "m-1": [1, 2], "m-2": [3, 4] },
		});
	});

	it("initializes an empty state when the cache is empty (first live vote)", () => {
		const client = new QueryClient();

		applyPollVoteUpdate(client, { messageId: "m-1", tallies: [0, 1] });

		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: {},
			tallies: { "m-1": [0, 1] },
		});
	});
});

describe("setMyPollVote", () => {
	it("records my vote optimistically without touching tallies", () => {
		const client = new QueryClient();
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: {}, tallies: { "m-1": [1, 1] } });

		setMyPollVote(client, "m-1", 1);

		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: { "m-1": 1 },
			tallies: { "m-1": [1, 1] },
		});
	});

	it("starts an empty state when the cache is empty", () => {
		const client = new QueryClient();

		setMyPollVote(client, "m-1", 0);

		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: { "m-1": 0 },
			tallies: {},
		});
	});
});

describe("clearMyPollVote", () => {
	it("removes only my vote for that message and keeps tallies intact", () => {
		const client = new QueryClient();
		client.setQueryData(CHAT_POLLS_KEY, {
			myVotes: { "m-1": 1, "m-2": 0 },
			tallies: { "m-1": [1, 2] },
		});

		clearMyPollVote(client, "m-1");

		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: { "m-2": 0 },
			tallies: { "m-1": [1, 2] },
		});
	});

	it("is a no-op (same cache) when I had not voted there", () => {
		const client = new QueryClient();
		client.setQueryData(CHAT_POLLS_KEY, { myVotes: { "m-2": 0 }, tallies: { "m-1": [1, 2] } });

		clearMyPollVote(client, "m-1");

		expect(client.getQueryData(CHAT_POLLS_KEY)).toEqual({
			myVotes: { "m-2": 0 },
			tallies: { "m-1": [1, 2] },
		});
	});
});

describe("parsePollPayload", () => {
	it("parses a valid payload to its options", () => {
		expect(parsePollPayload({ options: ["Tak", "Nie"] })).toEqual({ options: ["Tak", "Nie"] });
	});

	it("returns null for a malformed payload (fallback rendering)", () => {
		expect(parsePollPayload(null)).toBeNull();
		expect(parsePollPayload({ options: "Tak" })).toBeNull();
		expect(parsePollPayload({ options: ["solo"] })).toBeNull();
	});
});
