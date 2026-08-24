// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (F7 #158):
// - runScheduled rozgałęzia handler `scheduled` po controller.cron:
//   "7 * * * *" → deleteExpiredChatMessages (czat), "0 6 * * *" → runCalendarJob
//   (zachowanie bez zmian); nieznane wyrażenie → kalendarz (domyślne, obecne
//   zachowanie — wrangler odpala tylko zarejestrowane crony).
// - initDatabase zostaje w server.ts — tu czysty branching po granicach modułów.
// Granice mockowane: calendar job + domena czatu (DB).
vi.mock("@/calendar/job", () => ({
	runCalendarJob: vi.fn(),
}));

vi.mock("@/db/chat", () => ({
	deleteExpiredChatMessages: vi.fn(),
}));

import { runCalendarJob } from "@/calendar/job";
import { deleteExpiredChatMessages } from "@/db/chat";
import { CHAT_EXPIRY_CRON, runScheduled } from "./scheduled";

const mockCalendar = vi.mocked(runCalendarJob);
const mockExpiry = vi.mocked(deleteExpiredChatMessages);

function controllerWith(cron: string): ScheduledController {
	return { cron } as ScheduledController;
}

describe("runScheduled (F7 #158) — rozgałęzienie po wyrażeniu crona", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("hourly chat cron runs the expiry cleanup and not the calendar job", async () => {
		mockExpiry.mockResolvedValue(2);

		await runScheduled(controllerWith("7 * * * *"), {} as Env, {} as ExecutionContext);

		expect(mockExpiry).toHaveBeenCalledTimes(1);
		expect(mockCalendar).not.toHaveBeenCalled();
	});

	it("the 6:00 calendar cron keeps running the calendar job unchanged", async () => {
		await runScheduled(controllerWith("0 6 * * *"), {} as Env, {} as ExecutionContext);

		expect(mockCalendar).toHaveBeenCalledTimes(1);
		expect(mockExpiry).not.toHaveBeenCalled();
	});

	it("an unknown cron expression falls back to the calendar job (current behavior)", async () => {
		await runScheduled(controllerWith("*/5 * * * *"), {} as Env, {} as ExecutionContext);

		expect(mockCalendar).toHaveBeenCalledTimes(1);
		expect(mockExpiry).not.toHaveBeenCalled();
	});

	it("CHAT_EXPIRY_CRON matches the expression registered in wrangler.jsonc", () => {
		expect(CHAT_EXPIRY_CRON).toBe("7 * * * *");
	});
});
