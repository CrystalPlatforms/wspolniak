// SPDX-License-Identifier: AGPL-3.0-or-later
import { deleteCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME } from "@/db/identity/session";
import { createHono } from "@/hono/factory";

/** Wylogowanie: sesja to httpOnly cookie, więc kasowanie wymaga serwera.
 *  Ustawienia → „Wyloguj się" woła ten endpoint i wraca na stronę główną. */
const logoutEndpoint = createHono();

logoutEndpoint.post("/", async (c) => {
	deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
	return c.json({ data: { ok: true } });
});

export default logoutEndpoint;
