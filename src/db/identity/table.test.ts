// SPDX-License-Identifier: AGPL-3.0-or-later
import { getTableColumns, getTableName } from "drizzle-orm";
import { users } from "./table";

describe("users table", () => {
	const columns = getTableColumns(users);

	it("is named 'users'", () => {
		expect(getTableName(users)).toBe("users");
	});

	it("has all expected columns", () => {
		expect(Object.keys(columns).sort()).toEqual(
			["id", "name", "role", "tokenHash", "deletedAt", "createdAt", "aiOptIn", "aiBlocked"].sort(),
		);
	});

	it("id is text primary key", () => {
		expect(columns.id.dataType).toBe("string");
		expect(columns.id.primary).toBe(true);
	});

	it("name is text not null", () => {
		expect(columns.name.dataType).toBe("string");
		expect(columns.name.notNull).toBe(true);
	});

	it("role is text not null", () => {
		expect(columns.role.dataType).toBe("string");
		expect(columns.role.notNull).toBe(true);
	});

	it("token_hash is text not null unique", () => {
		expect(columns.tokenHash.dataType).toBe("string");
		expect(columns.tokenHash.notNull).toBe(true);
		expect(columns.tokenHash.isUnique).toBe(true);
	});

	it("deleted_at is nullable timestamp", () => {
		expect(columns.deletedAt.dataType).toBe("date");
		expect(columns.deletedAt.notNull).toBe(false);
	});

	it("created_at is timestamp not null with default", () => {
		expect(columns.createdAt.dataType).toBe("date");
		expect(columns.createdAt.notNull).toBe(true);
		expect(columns.createdAt.hasDefault).toBe(true);
	});
});
