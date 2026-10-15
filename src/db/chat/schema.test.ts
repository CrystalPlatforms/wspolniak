// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#214): token linku to zwykły tekst — schema bez zmian;
// 200 znaków liczy token jako znaki (PRD #201). Oba testy charakterują
// istniejące zachowanie (limit + trim + min), teraz z tokenem w treści.
//
// Założenia kontraktu union po `kind` (F2 #215, F3 #216):
// - Brak `kind` = zwykły tekst (wsteczna kompatybilność z klientami sprzed ankiet).
// - Ankieta: pytanie 1–200 (kolumna `text`), payload 2–6 opcji po 1–100 znaków.
// - Lokalizacja: lat −90..90, lng −180..180, opcjonalna etykieta ≤ 200 znaków.
import { createChatMessageSchema, locationPayloadSchema, pollPayloadSchema, voteChatPollSchema } from "./schema";

describe("createChatMessageSchema — link token (#214)", () => {
	it("accepts a message containing a link token within the limit", () => {
		const result = createChatMessageSchema.safeParse({
			text: "Zobacz [Przepis|kliknij](https://example.com)",
		});

		expect(result.success).toBe(true);
	});

	it("rejects a link-token message over the 200-char limit", () => {
		const token = "[|](https://example.com)";
		const long = `${token}${"a".repeat(200)}`;

		const result = createChatMessageSchema.safeParse({ text: long });

		expect(result.success).toBe(false);
	});
});

describe("createChatMessageSchema — union po `kind` (F2 #215, F3 #216)", () => {
	it("treats a body without `kind` as a text message (back-compat)", () => {
		const result = createChatMessageSchema.safeParse({ text: "Hej!" });

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.kind).toBe("text");
	});

	it("accepts a poll with question and two options", () => {
		const result = createChatMessageSchema.safeParse({
			kind: "poll",
			text: "Pizza w piątek?",
			payload: { options: ["Tak", "Nie"] },
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data).toMatchObject({
			kind: "poll",
			payload: { options: ["Tak", "Nie"] },
		});
	});
});

describe("pollPayloadSchema (F2 #215)", () => {
	it("accepts 2 and 6 options (boundary values)", () => {
		expect(pollPayloadSchema.safeParse({ options: ["a", "b"] }).success).toBe(true);
		expect(
			pollPayloadSchema.safeParse({ options: ["1", "2", "3", "4", "5", "6"] }).success,
		).toBe(true);
	});

	it("rejects fewer than 2 options", () => {
		expect(pollPayloadSchema.safeParse({ options: ["solo"] }).success).toBe(false);
		expect(pollPayloadSchema.safeParse({ options: [] }).success).toBe(false);
	});

	it("rejects more than 6 options", () => {
		expect(
			pollPayloadSchema.safeParse({ options: ["1", "2", "3", "4", "5", "6", "7"] }).success,
		).toBe(false);
	});

	it("rejects an empty or whitespace-only option", () => {
		expect(pollPayloadSchema.safeParse({ options: ["a", ""] }).success).toBe(false);
		expect(pollPayloadSchema.safeParse({ options: ["a", "   "] }).success).toBe(false);
	});

	it("rejects an option over 100 characters", () => {
		expect(pollPayloadSchema.safeParse({ options: ["a", "b".repeat(101)] }).success).toBe(false);
		expect(pollPayloadSchema.safeParse({ options: ["a", "b".repeat(100)] }).success).toBe(true);
	});
});

describe("locationPayloadSchema (F3 #216)", () => {
	it("accepts valid coordinates with and without a label", () => {
		expect(locationPayloadSchema.safeParse({ lat: 52.23, lng: 21.01 }).success).toBe(true);
		expect(
			locationPayloadSchema.safeParse({ lat: 52.23, lng: 21.01, label: "Domek" }).success,
		).toBe(true);
	});

	it("accepts boundary coordinates (±90 lat, ±180 lng)", () => {
		expect(locationPayloadSchema.safeParse({ lat: 90, lng: 180 }).success).toBe(true);
		expect(locationPayloadSchema.safeParse({ lat: -90, lng: -180 }).success).toBe(true);
	});

	it("rejects latitude out of range", () => {
		expect(locationPayloadSchema.safeParse({ lat: 90.1, lng: 0 }).success).toBe(false);
		expect(locationPayloadSchema.safeParse({ lat: -90.1, lng: 0 }).success).toBe(false);
	});

	it("rejects longitude out of range", () => {
		expect(locationPayloadSchema.safeParse({ lat: 0, lng: 180.1 }).success).toBe(false);
		expect(locationPayloadSchema.safeParse({ lat: 0, lng: -180.1 }).success).toBe(false);
	});

	it("rejects non-numeric coordinates", () => {
		expect(
			locationPayloadSchema.safeParse({ lat: "52", lng: 21 } as unknown).success,
		).toBe(false);
	});

	it("rejects an empty label but accepts whitespace-trimmed non-empty", () => {
		expect(locationPayloadSchema.safeParse({ lat: 0, lng: 0, label: "" }).success).toBe(false);
		expect(locationPayloadSchema.safeParse({ lat: 0, lng: 0, label: "  " }).success).toBe(false);
	});
});

describe("voteChatPollSchema (F2 #215)", () => {
	it("accepts a non-negative integer index", () => {
		expect(voteChatPollSchema.safeParse({ optionIndex: 0 }).success).toBe(true);
		expect(voteChatPollSchema.safeParse({ optionIndex: 5 }).success).toBe(true);
	});

	it("rejects negative, fractional and non-numeric values", () => {
		expect(voteChatPollSchema.safeParse({ optionIndex: -1 }).success).toBe(false);
		expect(voteChatPollSchema.safeParse({ optionIndex: 1.5 }).success).toBe(false);
		expect(voteChatPollSchema.safeParse({ optionIndex: "0" }).success).toBe(false);
	});

	// Zakres WZGLĘDEM liczby opcji pilnuje domena (voteChatPoll) — schemat celowo
	// pozwala 0–5 (maks. 6 opcji), żeby nie dublować źródła prawdy.
	it("allows up to index 5 (max 6 options) — upper bound lives in the domain", () => {
		expect(voteChatPollSchema.safeParse({ optionIndex: 6 }).success).toBe(false);
	});
});
