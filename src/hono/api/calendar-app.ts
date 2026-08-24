// SPDX-License-Identifier: AGPL-3.0-or-later
import { listCalendarEvents } from "@/db/calendar";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

/**
 * Widok kalendarza dla wszystkich członków rodziny (#163 Kalendarz v2):
 * tylko odczyt — tworzenie/edycja/usuwanie zostają na /api/admin/calendar
 * (adminMiddleware). Mirror wzorca video-app.
 */
const calendarAppEndpoint = createHono();

calendarAppEndpoint.use("*", authMiddleware());

calendarAppEndpoint.get("/", async (c) => {
	const data = await listCalendarEvents();
	return c.json({ data });
});

export default calendarAppEndpoint;
