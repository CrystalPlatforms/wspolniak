// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu migracji (F2 #215, AC: "Migration adds kind + payload;
// existing rows read back as kind='text'"):
// - Środowisko CI/lokalne tego projektu nie stawia żywego Postgresa pod testy
//   (cała domena mockuje getDb), więc zamiast "query after migration in test DB"
//   test charakteryzuje KONTRAKT: SQL migracji dev (default 'text' backfilluje
//   istniejące wiersze) + metadane tabeli Drizzle, z których SQL jest generowany.
// - Nakładanie migracji na żywe DB robi `pnpm db:dev:migrate` (HITL).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { chatMessages, chatPollVotes } from "./table";

const migrationsDir = join(import.meta.dirname, "..", "migrations", "dev");

/** Skleja wszystkie pliki .sql migracji dev (nazwy plików są generowane losowo). */
function allMigrationSql(): string {
	return readdirSync(migrationsDir)
		.filter((file) => file.endsWith(".sql"))
		.map((file) => readFileSync(join(migrationsDir, file), "utf-8"))
		.join("\n");
}

describe("chat migrations (F2 #215)", () => {
	it("adds the kind column with default 'text' (existing rows backfill as text)", () => {
		const sql = allMigrationSql();
		expect(sql).toContain("ADD COLUMN \"kind\" text DEFAULT 'text' NOT NULL");
	});

	it("adds the nullable jsonb payload column", () => {
		const sql = allMigrationSql();
		expect(sql).toContain('ADD COLUMN "payload" jsonb');
	});

	it("creates chat_poll_votes with a unique (message_id, user_id) index", () => {
		const sql = allMigrationSql();
		expect(sql).toContain('CREATE TABLE "chat_poll_votes"');
		expect(sql).toContain('"option_index" integer NOT NULL');
		expect(sql).toContain(
			'CREATE UNIQUE INDEX "chat_poll_votes_message_user_idx" ON "chat_poll_votes" USING btree ("message_id","user_id")',
		);
	});
});

describe("chat table metadata (F2 #215)", () => {
	it("chat_messages.kind defaults to 'text' and is NOT NULL", () => {
		const { columns } = getTableConfig(chatMessages);
		const kind = columns.find((column) => column.name === "kind");
		expect(kind).toBeDefined();
		expect(kind?.hasDefault).toBe(true);
		expect(kind?.default).toBe("text");
		expect(kind?.notNull).toBe(true);
		const payload = columns.find((column) => column.name === "payload");
		expect(payload).toBeDefined();
		expect(payload?.notNull).toBe(false);
	});

	it("chat_poll_votes carries the unique (message_id, user_id) constraint", () => {
		const { indexes } = getTableConfig(chatPollVotes);
		const unique = indexes.find(
			(index) => index.config.name === "chat_poll_votes_message_user_idx",
		);
		expect(unique).toBeDefined();
		expect(unique?.config.unique).toBe(true);
		const columnNames = unique?.config.columns.flatMap((column) =>
			column instanceof Object && "name" in column ? [column.name] : [],
		);
		expect(columnNames).toEqual(["message_id", "user_id"]);
	});
});
