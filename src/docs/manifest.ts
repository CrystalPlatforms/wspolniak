// SPDX-License-Identifier: AGPL-3.0-or-later
// Manifesty działów docsów (F5 #208): grupy → dokumenty, sterują sidebarem
// (BranchedMenu). Grupy są autorskie, tytuły pochodzą z registry — w sidebarze
// zawsze widnieje tytuł artykułu. Dokument bez pliku w registry jest pomijany,
// więc manifest nie renderuje martwych linków.

import {
	IconBellRinging,
	IconBolt,
	IconBook2,
	IconFolderOpen,
	IconGauge,
	IconHeart,
	IconKey,
	IconNews,
	IconPhotoOff,
	IconRobot,
	IconShieldCheck,
	IconSparkles,
	IconStack2,
	IconTool,
	type TablerIcon,
} from "@tabler/icons-react";
import { type DocDepartment, getDoc } from "./registry";

export interface ManifestDoc {
	slug: string;
	title: string;
	icon: TablerIcon;
}

export interface ManifestGroup {
	label: string;
	icon: TablerIcon;
	docs: ManifestDoc[];
}

export interface DepartmentManifest {
	groups: ManifestGroup[];
}

/** Definicja grupy: etykieta + slugi; tytuły dochodzą z registry w runtime. */
interface GroupDef {
	label: string;
	slugs: readonly string[];
	icon: TablerIcon;
}

const MANIFESTS: Record<DocDepartment, GroupDef[]> = {
	product: [
		{
			label: "Posty i multimedia",
			slugs: ["feed-and-posts", "uploading-photos", "videos"],
			icon: IconNews,
		},
		{
			label: "Interakcje",
			slugs: ["reactions-comments", "family-chat"],
			icon: IconHeart,
		},
		{
			label: "Organizacja",
			slugs: ["albums", "library", "calendar"],
			icon: IconFolderOpen,
		},
		{
			label: "Aplikacja",
			slugs: ["notifications-and-pwa", "logging-in", "al-assistant", "for-admins"],
			icon: IconSparkles,
		},
	],
	technical: [
		{
			label: "Platforma",
			slugs: [
				"stack",
				"architecture",
				"deploy-and-migrations",
				"database-and-domains",
				"testing-strategy",
				"docs-under-the-hood",
			],
			icon: IconStack2,
		},
		{
			label: "Bezpieczeństwo",
			slugs: ["security-and-privacy"],
			icon: IconShieldCheck,
		},
		{
			label: "Multimedia i limity",
			slugs: ["photo-upload-pipeline", "video-pipeline", "limits-and-performance"],
			icon: IconGauge,
		},
		{
			label: "Czas rzeczywisty",
			slugs: ["realtime-chat", "push-under-the-hood", "pwa-offline"],
			icon: IconBolt,
		},
		{
			label: "Sztuczna inteligencja",
			slugs: ["al-internals"],
			icon: IconRobot,
		},
		{
			label: "Dokumentacja",
			slugs: ["docs-under-the-hood"],
			icon: IconBook2,
		},
	],
	bugs: [
		{
			label: "Konto i logowanie",
			slugs: ["magic-link-not-arriving"],
			icon: IconKey,
		},
		{
			label: "Zdjęcia i filmiki",
			slugs: ["big-photo", "youtube-video-problems", "slow-upload"],
			icon: IconPhotoOff,
		},
		{
			label: "Powiadomienia i czat",
			slugs: ["push-notifications-missing", "chat-messages-missing"],
			icon: IconBellRinging,
		},
		{
			label: "Aplikacja",
			slugs: ["stale-content-cache", "feature-turned-off"],
			icon: IconTool,
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
