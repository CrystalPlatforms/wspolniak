// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ChatToken } from "./stream-protocol";

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/**
 * Parser strumieniowy tagów `<think>…</think>` (Qwen na Groq): myślenie leci
 * w ZWYKŁEJ treści opakowane tagami, a nie osobnym polem API. Parser tnie
 * tokeny na żywo — odporny na rocięcie tagu między chunkami sieciowymi
 * (częściowy prefix tagu czeka w buforze na dopełnienie).
 */
export class ThinkParser {
	private buffer = "";
	private inThink = false;
	private trimNextText = false;

	/** Dokłada chunk treści; zwraca 0..2 tokenów (tekst przed tagiem, myślenie). */
	push(text: string): ChatToken[] {
		this.buffer += text;
		const out: ChatToken[] = [];
		for (;;) {
			const tag = this.inThink ? CLOSE_TAG : OPEN_TAG;
			const at = this.buffer.indexOf(tag);
			if (at === -1) {
				// koniec bufora może być początkiem tagu — zostaw go, wydaj resztę
				const keep = tailPrefixLen(this.buffer, tag);
				const emit = this.buffer.slice(0, this.buffer.length - keep);
				this.buffer = this.buffer.slice(this.buffer.length - keep);
				const token = this.makeToken(emit);
				if (token) out.push(token);
				return out;
			}
			const before = this.buffer.slice(0, at);
			this.buffer = this.buffer.slice(at + tag.length);
			const token = this.makeToken(before);
			if (token) out.push(token);
			this.inThink = !this.inThink;
			// treść zaraz po </think> zwykle zaczyna się od \n — przytnij go raz
			this.trimNextText = !this.inThink;
		}
	}

	/** Koniec strumienia — wydaj niedokończony bufor (np. wiszący „<"). */
	flush(): ChatToken[] {
		const rest = this.buffer;
		this.buffer = "";
		const token = this.makeToken(rest);
		return token ? [token] : [];
	}

	private makeToken(text: string): ChatToken | null {
		if (this.trimNextText && !this.inThink) {
			const trimmed = text.replace(/^\s+/, "");
			// chunk z samych białych znaków po </think> — flaga zostaje uzbrojona,
			// żeby treść faktycznie zaczęła się od pierwszego sensownego znaku
			if (trimmed === "") return null;
			this.trimNextText = false;
			text = trimmed;
		}
		if (text.length === 0) return null;
		return { kind: this.inThink ? "reasoning" : "text", text };
	}
}

/** Największe k takie, że bufor kończy się k-znakowym prefixem tagu. */
function tailPrefixLen(buffer: string, tag: string): number {
	const max = Math.min(buffer.length, tag.length - 1);
	for (let k = max; k > 0; k--) {
		if (buffer.endsWith(tag.slice(0, k))) return k;
	}
	return 0;
}
