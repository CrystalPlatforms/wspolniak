// SPDX-License-Identifier: AGPL-3.0-or-later
import { getTableName } from "drizzle-orm";
import { uploadFailures } from "./table";

describe("upload_failures table", () => {
	it("is named upload_failures", () => {
		expect(getTableName(uploadFailures)).toBe("upload_failures");
	});
});
