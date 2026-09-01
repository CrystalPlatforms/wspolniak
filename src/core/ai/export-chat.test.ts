// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildMarkdown, buildPlainText } from "./export-chat";
import type { UiChatMessage } from "./use-ai-chat";

const conversation: UiChatMessage[] = [
	{ role: "user", content: "Cześć AL" },
	{ role: "assistant", content: "Cześć! W czym mogę pomóc?" },
];

describe("buildMarkdown", () => {
	it("oznacza autorów wiadomości Ty/AL", () => {
		const md = buildMarkdown(conversation);
		expect(md).toContain("### Ty");
		expect(md).toContain("### AL");
	});

	it("zachowuje treść wiadomości i nagłówek konwersacji", () => {
		const md = buildMarkdown(conversation);
		expect(md).toContain("# Konwersacja z AL");
		expect(md).toContain("Cześć AL");
		expect(md).toContain("W czym mogę pomóc?");
	});

	it("rozdziela wiadomości separatorem", () => {
		expect(buildMarkdown(conversation)).toContain("---");
	});
});

describe("buildPlainText", () => {
	it("prefixuje wiadomości autorami", () => {
		const txt = buildPlainText(conversation);
		expect(txt).toContain("Ty:\nCześć AL");
		expect(txt).toContain("AL:\nCześć! W czym mogę pomóc?");
	});
});
