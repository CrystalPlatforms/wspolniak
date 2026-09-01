// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeTokenLine, encodeToken } from "./stream-protocol";

describe("encodeToken", () => {
	it("koduje treść jako linię NDJSON z k:'t'", () => {
		expect(encodeToken({ kind: "text", text: "Cześć" })).toBe('{"k":"t","v":"Cześć"}\n');
	});

	it("koduje myślenie jako linię NDJSON z k:'r'", () => {
		expect(encodeToken({ kind: "reasoning", text: "hmm" })).toBe('{"k":"r","v":"hmm"}\n');
	});

	it("escapuje nowe linie w treści, więc jedna linia = jeden token", () => {
		const line = encodeToken({ kind: "text", text: "a\nb" });
		expect(line.split("\n")).toHaveLength(2); // treść + pusta po \n kończącym
		expect(line).toContain("\\n");
	});
});

describe("decodeTokenLine", () => {
	it("robi rundę encode → decode bez strat", () => {
		const cases = [
			{ kind: "text" as const, text: "zwykły token" },
			{ kind: "reasoning" as const, text: 'myślę\nwiele linii "z cudzysłowami"' },
		];
		for (const token of cases) {
			const encoded = encodeToken(token).trim();
			expect(decodeTokenLine(encoded)).toEqual(token);
		}
	});

	it("zwraca null dla pustych i śmieciowych linii", () => {
		expect(decodeTokenLine("")).toBeNull();
		expect(decodeTokenLine("   ")).toBeNull();
		expect(decodeTokenLine("not json")).toBeNull();
		expect(decodeTokenLine('{"k":"x","v":"nieznany rodzaj"}')).toBeNull();
		expect(decodeTokenLine('{"k":"t","v":123}')).toBeNull();
	});
});
