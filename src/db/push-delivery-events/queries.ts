// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { pushDeliveryEvents } from "./table";

export type PushDeliveryEvent = InferSelectModel<typeof pushDeliveryEvents>;
export type NewPushDeliveryEvent = InferInsertModel<typeof pushDeliveryEvents>;

export type DeliveryOutcome = "success" | "gone" | "failure";
export type DeliveryTriggerKind = "post" | "comment" | "mention";

export interface DeliveryRecord {
	endpoint: string;
	userId: string;
	outcome: DeliveryOutcome;
	statusCode: number | null;
	triggerKind: DeliveryTriggerKind;
}

export interface DeliveryWindow {
	from: Date;
	to: Date;
}

export interface DeliveryCounts {
	attempts: number;
	successes: number;
}

// Zapisuje pojedynczą próbę wysyłki push. Wywoływane z fan-outu w try/catch —
// błąd zapisu nie może wywrócić wysyłki powiadomień (defensive).
export async function recordDelivery(input: DeliveryRecord): Promise<void> {
	await getDb()
		.insert(pushDeliveryEvents)
		.values({ id: crypto.randomUUID(), ...input });
}

// Agreguje próby w oknie czasowym wg outcome. successes = outcome='success'.
export async function countDeliveriesInWindow(window: DeliveryWindow): Promise<DeliveryCounts> {
	const rows = await getDb()
		.select({
			outcome: pushDeliveryEvents.outcome,
			count: sql`count(*)`.mapWith(Number),
		})
		.from(pushDeliveryEvents)
		.where(
			and(
				gte(pushDeliveryEvents.createdAt, window.from),
				lte(pushDeliveryEvents.createdAt, window.to),
			),
		)
		.groupBy(pushDeliveryEvents.outcome);

	let attempts = 0;
	let successes = 0;
	for (const row of rows) {
		attempts += row.count;
		if (row.outcome === "success") successes += row.count;
	}
	return { attempts, successes };
}
