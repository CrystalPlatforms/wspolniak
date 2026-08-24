// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#166): createRateLimiter({windowMs, max}) zwraca middleware,
// który liczy żądania per klucz klienta (IP: CF-Connecting-IP → x-forwarded-for
// → "unknown"). Po max żądaniach w oknie windowMs zwraca 429 {error}; okno jest
// stałe (fixed window) — licznik resetuje się po jego upływie. Stan trzyma
// Map w pamięci isolate'a Workera (wystarcza dla aplikacji rodzinnej).
import { Hono } from "hono";
import { createRateLimiter } from "./rate-limit";

function createTestApp(options: { windowMs: number; max: number }) {
	const app = new Hono();
	app.use("*", createRateLimiter(options));
	app.post("/attempt", (c) => c.json({ ok: true }));
	return app;
}

describe("createRateLimiter", () => {
	it("allows up to max attempts from one IP, then blocks with 429", async () => {
		const app = createTestApp({ windowMs: 60_000, max: 2 });

		const first = await app.request("/attempt", {
			method: "POST",
			headers: { "x-forwarded-for": "1.2.3.4" },
		});
		expect(first.status).toBe(200);

		const second = await app.request("/attempt", {
			method: "POST",
			headers: { "x-forwarded-for": "1.2.3.4" },
		});
		expect(second.status).toBe(200);

		const third = await app.request("/attempt", {
			method: "POST",
			headers: { "x-forwarded-for": "1.2.3.4" },
		});
		expect(third.status).toBe(429);
		const body = (await third.json()) as { error: string };
		expect(body.error).toBe("Too many requests");
	});

	it("resets the counter after the window expires", async () => {
		vi.useFakeTimers();
		try {
			const app = createTestApp({ windowMs: 60_000, max: 2 });

			// Wyczerpujemy limit w pierwszym oknie.
			await app.request("/attempt", { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" } });
			await app.request("/attempt", { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" } });
			const blocked = await app.request("/attempt", {
				method: "POST",
				headers: { "x-forwarded-for": "1.2.3.4" },
			});
			expect(blocked.status).toBe(429);

			// Po upływie okna licznik startuje od nowa.
			vi.advanceTimersByTime(60_001);
			const afterWindow = await app.request("/attempt", {
				method: "POST",
				headers: { "x-forwarded-for": "1.2.3.4" },
			});
			expect(afterWindow.status).toBe(200);
		} finally {
			vi.useRealTimers();
		}
	});

	it("tracks IPs independently — exhausting one does not block another", async () => {
		const app = createTestApp({ windowMs: 60_000, max: 1 });

		await app.request("/attempt", { method: "POST", headers: { "x-forwarded-for": "1.1.1.1" } });
		const blockedIp = await app.request("/attempt", {
			method: "POST",
			headers: { "x-forwarded-for": "1.1.1.1" },
		});
		expect(blockedIp.status).toBe(429);

		const otherIp = await app.request("/attempt", {
			method: "POST",
			headers: { "x-forwarded-for": "2.2.2.2" },
		});
		expect(otherIp.status).toBe(200);
	});
});
