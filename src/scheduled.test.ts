// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (po #245): runScheduled jest cienkim delegatem do
// runCalendarJob — worker ma JEDEN trigger ("0 6 * * *", oba wrangler configi),
// więc każde wyrażenie cron trafia do kalendarza (wrangler odpala tylko
// zarejestrowane crony). initDatabase zostaje w server.ts — tu czysta granica
// modułu kalendarza.
// Granice mockowane: calendar job (moduł zewnętrzny wobec scheduled.ts).
vi.mock("@/calendar/job", () => ({
	runCalendarJob: vi.fn(),
}));

import { runCalendarJob } from "@/calendar/job";
import { runScheduled } from "./scheduled";

const mockCalendar = vi.mocked(runCalendarJob);

function controllerWith(cron: string): ScheduledController {
	return { cron } as ScheduledController;
}

describe("runScheduled — delegacja do kalendarza", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("the 6:00 calendar cron runs the calendar job", async () => {
		await runScheduled(controllerWith("0 6 * * *"), {} as Env, {} as ExecutionContext);

		expect(mockCalendar).toHaveBeenCalledTimes(1);
	});

	it("any other registered expression still routes to the calendar job", async () => {
		await runScheduled(controllerWith("*/5 * * * *"), {} as Env, {} as ExecutionContext);

		expect(mockCalendar).toHaveBeenCalledTimes(1);
	});
});
