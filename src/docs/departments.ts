// SPDX-License-Identifier: AGPL-3.0-or-later
// Metadane działów docsów (F1 #204) — karty na docs landingu, breadcrumby w stronach
// dokumentów, docelowo manifesty grup dla sidebara (F5).
import { IconBook2, IconBug, IconTool, type TablerIcon } from "@tabler/icons-react";
import type { DocDepartment } from "./registry";

export interface DocDepartmentMeta {
	key: DocDepartment;
	label: string;
	icon: TablerIcon;
}

export const DOC_DEPARTMENT_META: DocDepartmentMeta[] = [
	{ key: "product", label: "Produkt", icon: IconBook2 },
	{ key: "technical", label: "Techniczna", icon: IconTool },
	{ key: "bugs", label: "Błędy", icon: IconBug },
];

export function getDepartmentMeta(key: DocDepartment): DocDepartmentMeta {
	const meta = DOC_DEPARTMENT_META.find((department) => department.key === key);
	if (!meta) throw new Error(`Unknown docs department: ${key}`);
	return meta;
}
