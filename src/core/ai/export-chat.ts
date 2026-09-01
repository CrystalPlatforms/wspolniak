// SPDX-License-Identifier: AGPL-3.0-or-later
import type { UiChatMessage } from "./use-ai-chat";

/**
 * Eksport konwersacji z AL (deep module): .md / .txt jako pobierany plik,
 * PDF przez okno drukowania przeglądarki („Zapisz jako PDF") — bez ciężkich
 * zależności typu jsPDF.
 */

export type ExportFormat = "md" | "txt" | "pdf";

/** Data w nazwie pliku, np. 2026-08-23. */
function fileStamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function buildMarkdown(messages: UiChatMessage[]): string {
	const blocks = messages.map((m) => {
		const who = m.role === "user" ? "Ty" : "AL";
		return `### ${who}\n\n${m.content}`;
	});
	return `# Konwersacja z AL\n\n_${fileStamp()}_\n\n---\n\n${blocks.join("\n\n---\n\n")}\n`;
}

export function buildPlainText(messages: UiChatMessage[]): string {
	const blocks = messages.map((m) => {
		const who = m.role === "user" ? "Ty" : "AL";
		return `${who}:\n${m.content}`;
	});
	return `Konwersacja z AL — ${fileStamp()}\n\n${blocks.join("\n\n———\n\n")}\n`;
}

function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buildPrintableHtml(messages: UiChatMessage[]): string {
	const items = messages
		.map((m) => {
			const who = m.role === "user" ? "Ty" : "AL";
			return `<div class="msg ${m.role}"><span class="who">${who}</span>${escapeHtml(m.content)}</div>`;
		})
		.join("");
	return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Konwersacja z AL</title>
<style>
	body { font-family: -apple-system, system-ui, sans-serif; max-width: 680px; margin: 24px auto; color: #111; }
	h1 { font-size: 18px; }
	.msg { border: 1px solid #ddd; border-radius: 10px; padding: 10px 14px; margin: 10px 0; white-space: pre-wrap; page-break-inside: avoid; }
	.msg.user { background: #f0fdf4; border-color: #86efac; }
	.who { display: block; font-weight: 700; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; }
	footer { margin-top: 16px; font-size: 11px; color: #777; }
</style>
</head>
<body>
<h1>Konwersacja z AL</h1>
${items}
<footer>Wspólniak AI — ${fileStamp()}</footer>
</body>
</html>`;
}

function downloadTextFile(filename: string, content: string, mime: string): void {
	const blob = new Blob([content], { type: `${mime};charset=utf-8` });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

/** PDF przez nowe okno + drukowanie. Zwraca false, gdy przeglądarka zablokowała popup. */
function printAsPdf(messages: UiChatMessage[]): boolean {
	const win = window.open("", "_blank", "width=720,height=900");
	if (!win) return false;
	win.document.write(buildPrintableHtml(messages));
	win.document.close();
	win.focus();
	win.print();
	return true;
}

/** Jeden punkt wejścia: eksportuje konwersację w wybranym formacie. */
export function exportConversation(messages: UiChatMessage[], format: ExportFormat): boolean {
	if (messages.length === 0) return false;
	switch (format) {
		case "md":
			downloadTextFile(`czat-al-${fileStamp()}.md`, buildMarkdown(messages), "text/markdown");
			return true;
		case "txt":
			downloadTextFile(`czat-al-${fileStamp()}.txt`, buildPlainText(messages), "text/plain");
			return true;
		case "pdf":
			return printAsPdf(messages);
	}
}
