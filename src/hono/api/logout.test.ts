// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu: POST /api/auth/logout kasuje httpOnly cookie sesyjne
// (Set-Cookie z Max-Age=0 w przeszłości, path / — jak przy ustawianiu) i zwraca
// 200 {data:{ok:true}}. Endpoint publiczny — wylogowanie nikomu nie szkodzi.
import { Hono } from "hono";
import { SESSION_COOKIE_NAME } from "@/db/identity/session";
import logoutEndpoint from "./logout";

function createApi() {
	const api = new Hono().basePath("/api");
	api.route("/auth/logout", logoutEndpoint);
	return api;
}

describe("POST /api/auth/logout", () => {
	it("clears the session cookie and returns ok", async () => {
		const res = await createApi().request("/api/auth/logout", { method: "POST" });

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { ok: boolean } };
		expect(body.data.ok).toBe(true);

		const setCookie = res.headers.get("set-cookie") ?? "";
		expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
		expect(setCookie).toContain("Max-Age=0");
		expect(setCookie).toContain("Path=/");
	});
});
