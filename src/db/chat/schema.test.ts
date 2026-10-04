// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#214): token linku to zwykły tekst — schema bez zmian;
// 200 znaków liczy token jako znaki (PRD #201). Oba testy charakterują
// istniejące zachowanie (limit + trim + min), teraz z tokenem w treści.
import { createChatMessageSchema } from "./schema";

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
