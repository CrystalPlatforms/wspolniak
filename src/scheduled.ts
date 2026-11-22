// SPDX-License-Identifier: AGPL-3.0-or-later
// Handler `scheduled` — codzienny cron kalendarza (D-0 posty od admina,
// wyrażenie "0 6 * * *" w triggers.crons w wrangler.jsonc + wrangler.prod.jsonc).
// Godzinowy cron czatu usunięty razem z czatem (#245); initDatabase zostaje
// w server.ts — tu czysta granica modułu kalendarza.
import { runCalendarJob } from "@/calendar/job";

export async function runScheduled(
	_controller: ScheduledController,
	env: Env,
	ctx: ExecutionContext,
): Promise<void> {
	await runCalendarJob(new Date(), env, ctx);
}
