// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ChatToken } from "./stream-protocol";
import { ThinkParser } from "./think-parser";

/** Pomocnik: pushuje chunki, zbiera tokeny (z flushem), a potem skleja
 *  sąsiednie tokeny tego samego rodzaju — dokładnie do konsumenta
 *  (use-ai-chat dokleja kolejne tokeny do jednego pola wiadomości). */
function run(chunks: string[]): ChatToken[] {
	const parser = new ThinkParser();
	const raw: ChatToken[] = [];
	for (const chunk of chunks) raw.push(...parser.push(chunk));
	raw.push(...parser.flush());
	const merged: ChatToken[] = [];
	for (const token of raw) {
		if (token.kind === "posts") continue; // parser myślenia nie produkuje kart
		const last = merged[merged.length - 1];
		if (last && last.kind === token.kind && "text" in last && "text" in token) {
			last.text += token.text;
		} else {
			merged.push(token);
		}
	}
	return merged;
}

describe("ThinkParser", () => {
	it("tekst bez tagów przelatuje bez zmian", () => {
		expect(run(["Cześć", "!"])).toEqual([{ kind: "text", text: "Cześć!" }]);
	});

	it("rozdziela myślenie od odpowiedzi w jednym chunku", () => {
		expect(run(["<think>analizuję</think>Odpowiedź"])).toEqual([
			{ kind: "reasoning", text: "analizuję" },
			{ kind: "text", text: "Odpowiedź" },
		]);
	});

	it("skleja tag rocięty między chunkami (realny przypadek sieciowy)", () => {
		expect(run(["<thi", "nk>myślę", "</th", "ink>Odp", "owiedź"])).toEqual([
			{ kind: "reasoning", text: "myślę" },
			{ kind: "text", text: "Odpowiedź" },
		]);
	});

	it("wielokrotnie przecięte tokeny wewnątrz myślenia lączą się w jeden strumień", () => {
		expect(run(["<think>", "krok 1", " krok 2", "</think>", "OK"])).toEqual([
			{ kind: "reasoning", text: "krok 1 krok 2" },
			{ kind: "text", text: "OK" },
		]);
	});

	it("przytnie prowadzące białe znaki pierwszej treści po myśleniu", () => {
		expect(run(["<think>x</think>\n\nCześć"])).toEqual([
			{ kind: "reasoning", text: "x" },
			{ kind: "text", text: "Cześć" },
		]);
	});

	it("flush wydaje wiszący niedokończony prefix (np. pojedynczy „<”)", () => {
		expect(run(["a <", "b"])).toEqual([{ kind: "text", text: "a <b" }]);
	});

	it("chunki z samych białych znaków po </think> nie uruchamiają treści", () => {
		expect(run(["<think>x</think>", "\n\n", " ", "Cześć"])).toEqual([
			{ kind: "reasoning", text: "x" },
			{ kind: "text", text: "Cześć" },
		]);
	});

	it("realna próbka Qwena: myślenie z wrapperem <think> i odpowiedź po nim", () => {
		const sample = run([
			'<think> Here\'s a thinking process:\nAnalyze: user says "elo".\n</think>\nCześć. W czym mogę pomóc?',
		]);
		expect(sample).toEqual([
			{
				kind: "reasoning",
				text: ' Here\'s a thinking process:\nAnalyze: user says "elo".\n',
			},
			{ kind: "text", text: "Cześć. W czym mogę pomóc?" },
		]);
	});
});
