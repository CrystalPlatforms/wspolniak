// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Notka o wygasaniu wiadomości czatu (F8 #159) — statyczna sekcja na
 * /app/settings, renderowana tylko gdy flaga `chat` jest włączona
 * (bez czata brak wiadomości, które znikają). Ustawia oczekiwania bez
 * zaśmiecania nagłówka czatu (decyzja PRD).
 */
export function ChatSettingsNote() {
	return (
		<section className="rounded-lg border border-border bg-card p-4">
			<h2 className="mb-1 text-lg font-semibold text-foreground">Chat</h2>
			<p className="text-sm text-muted-foreground">Wiadomości na Chacie znikają po 24 godzinach.</p>
		</section>
	);
}
