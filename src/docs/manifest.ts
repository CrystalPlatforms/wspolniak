// SPDX-License-Identifier: AGPL-3.0-or-later
// Manifesty działów docsów (F5 #208): grupy → dokumenty, sterują sidebarem
// (BranchedMenu). Grupy są autorskie, tytuły pochodzą z registry — w sidebarze
// zawsze widnieje tytuł artykułu. Dokument bez pliku w registry jest pomijany,
// więc manifest nie renderuje martwych linków.

import { ImageOff, Layers, type LucideIcon, Newspaper } from "lucide-react";
import { type DocDepartment, getDoc } from "./registry";

export interface ManifestDoc {
	slug: string;
	title: string;
	icon: LucideIcon;
}

export interface ManifestGroup {
	label: string;
	icon: LucideIcon;
	docs: ManifestDoc[];
}

export interface DepartmentManifest {
	groups: ManifestGroup[];
}

/** Definicja grupy: etykieta + slugi; tytuły dochodzą z registry w runtime. */
interface GroupDef {
	label: string;
	slugs: readonly string[];
	icon: LucideIcon;
}

const MANIFESTS: Record<DocDepartment, GroupDef[]> = {
	product: [
		{
			label: "Posty i multimedia",
			slugs: ["feed-and-posts", "uploading-photos"],
			icon: Newspaper,
		},
	],
	technical: [
		{
			label: "Platforma",
			slugs: ["stack", "architecture", "deploy-and-migrations"],
			icon: Layers,
		},
	],
	bugs: [
		{
			label: "Znane problemy",
			slugs: ["big-photo"],
			icon: ImageOff,
		},
	],
};

export function getDepartmentManifest(department: DocDepartment): DepartmentManifest {
	const groups = MANIFESTS[department].map((def) => {
		const docs = def.slugs
			.map((slug) => getDoc(department, slug))
			.filter((doc) => doc !== null)
			.map((doc) => ({ title: doc.title, slug: doc.slug, icon: def.icon }));
		return { label: def.label, icon: def.icon, docs };
	});
	return { groups };
}
