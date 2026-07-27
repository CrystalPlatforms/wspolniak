// SPDX-License-Identifier: AGPL-3.0-or-later
import { planChunks } from "./plan-chunks";

describe("planChunks", () => {
	it("splits a file into inclusive byte ranges across multiple chunks", () => {
		expect(planChunks(200, 90)).toEqual([
			{ start: 0, end: 89, total: 200, index: 0 },
			{ start: 90, end: 179, total: 200, index: 1 },
			{ start: 180, end: 199, total: 200, index: 2 },
		]);
	});

	it("returns a single chunk when the file fits in one chunk", () => {
		expect(planChunks(100, 100)).toEqual([{ start: 0, end: 99, total: 100, index: 0 }]);
		expect(planChunks(50, 100)).toEqual([{ start: 0, end: 49, total: 50, index: 0 }]);
	});

	it("returns an empty plan for a zero-byte file", () => {
		expect(planChunks(0, 90)).toEqual([]);
	});
});
