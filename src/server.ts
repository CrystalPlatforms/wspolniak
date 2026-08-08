// SPDX-License-Identifier: AGPL-3.0-or-later
// DO NOT DELETE THIS FILE!!!
// Custom CF Workers entry: routes /api/* to Hono, /app/u/* to auth, rest to TanStack Start.
// `scheduled` handler odpala cron kalendarza (D-0 posty od admina).
/// <reference types="vite/client" />
import { runCalendarJob } from "@/calendar/job";
import { initDatabase } from "@/db";
import { apiHono } from "@/hono/api";
import authRoute from "@/hono/api/auth";
import { createHono } from "@/hono/factory";

const authHono = createHono();
authHono.route("/app/u", authRoute);

// Obejście błędu SSR HMR „createStartHandler is not a function" (TanStack/router#7285):
// statyczny import `@tanstack/react-start/server-entry` traci eksport createStartHandler
// przy każdym przeładowaniu HMR (TanStack Start × @cloudflare/vite-plugin). Dynamiczny import
// materializuje namespace dopiero w czasie wywołania (po rozliczeniu HMR), a unieważnienie
// cache w import.meta.hot.accept wymusza świeży import po każdej aktualizacji.
type ServerEntry = {
	fetch: (
		request: Request,
		opts: { context: { fromFetch: boolean } },
	) => Promise<Response> | Response;
};

let ssrEntry: ServerEntry | null = null;

async function getSsrEntry(): Promise<ServerEntry> {
	if (!ssrEntry) {
		const mod = await import("@tanstack/react-start/server-entry");
		ssrEntry = mod.default as ServerEntry;
	}
	return ssrEntry;
}

if (import.meta.hot) {
	import.meta.hot.accept(() => {
		ssrEntry = null;
	});
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		initDatabase({
			host: env.DATABASE_HOST,
			username: env.DATABASE_USERNAME,
			password: env.DATABASE_PASSWORD,
		});

		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			return apiHono.fetch(request, env, ctx);
		}

		if (url.pathname.startsWith("/app/u/")) {
			return authHono.fetch(request, env, ctx);
		}

		return getSsrEntry().then((handler) =>
			handler.fetch(request, { context: { fromFetch: true } }),
		);
	},
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		initDatabase({
			host: env.DATABASE_HOST,
			username: env.DATABASE_USERNAME,
			password: env.DATABASE_PASSWORD,
		});
		await runCalendarJob(new Date(), env, ctx);
	},
};
