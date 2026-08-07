// SPDX-License-Identifier: AGPL-3.0-or-later
import { getTableName } from "drizzle-orm";
import { bookmarks } from "./table";

describe("bookmarks table", () => {
	it("is named bookmarks", () => {
		expect(getTableName(bookmarks)).toBe("bookmarks");
	});
});
