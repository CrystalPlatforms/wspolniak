// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Stub modułu `cloudflare:workers` dla vitest — jedyny import, którego nie da się
 * rozwiązać w Node/jsdom. W runtime (workerd) działa prawdziwy moduł; tutaj
 * wystarczy baza `DurableObject` przechowująca ctx/env (konstruktor klasy potomka
 * woła super). Testy mockują DurableObjectState na zewnątrz.
 */
export class DurableObject<TEnv = unknown> {
	constructor(
		public ctx: DurableObjectState,
		public env: TEnv,
	) {}
}
