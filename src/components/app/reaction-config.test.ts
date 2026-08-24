// SPDX-License-Identifier: AGPL-3.0-or-later
import { REACTION_CONFIG, REACTION_ORDER } from "./reaction-config";

describe("REACTION_CONFIG", () => {
	it("lists all five reaction types in a stable order", () => {
		expect(REACTION_ORDER).toEqual(["heart", "laugh", "flame", "wow", "sad"]);
	});

	it("exposes a non-empty Polish label for each type", () => {
		for (const type of REACTION_ORDER) {
			const entry = REACTION_CONFIG[type];
			expect(entry.label.length).toBeGreaterThan(0);
		}
	});
});
