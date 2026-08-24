// SPDX-License-Identifier: AGPL-3.0-or-later
// Rozgałęzienie handlera `scheduled` po wyrażeniu crona (F7 #158): godzinowy
// cron czatu czyści wygasłe wiadomości; pozostałe wyrażenia (codzienny 6:00)
// trafiają do crona kalendarza jak dotychczas. Wyrażenia są zarejestrowane w
// triggers.crons w wrangler.jsonc (dev + production); initDatabase zostaje
// w server.ts — tu czysty branching po granicach modułów.
import { runCalendarJob } from "@/calendar/job";
import { deleteExpiredChatMessages } from "@/db/chat";

/** Godzinowy cron czyszczenia czatu — zgodny z triggers.crons w wrangler.jsonc. */
export const CHAT_EXPIRY_CRON = "7 * * * *";

export async function runScheduled(
	controller: ScheduledController,
	env: Env,
	ctx: ExecutionContext,
): Promise<void> {
	if (controller.cron === CHAT_EXPIRY_CRON) {
		const deleted = await deleteExpiredChatMessages();
		if (deleted > 0) {
			// biome-ignore lint/suspicious/noConsole: widoczność crona czatu w wrangler tail
			console.log("[chat-expiry] cleaned expired messages", { deleted });
		}
		return;
	}
	await runCalendarJob(new Date(), env, ctx);
}
