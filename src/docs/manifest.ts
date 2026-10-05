// SPDX-License-Identifier: AGPL-3.0-or-later
// Manifesty działów docsów (F5 #208): grupy → dokumenty, sterują sidebarem
// (BranchedMenu). Grupy są autorskie, tytuły pochodzą z registry — w sidebarze
// zawsze widnieje tytuł artykułu. Dokument bez pliku w registry jest pomijany,
// więc manifest nie renderuje martwych linków.

import {
	BellRing,
	BookOpen,
	Bot,
	FolderOpen,
	Gauge,
	Heart,
	ImageOff,
	KeyRound,
	Layers,
	type LucideIcon,
	Newspaper,
	ShieldCheck,
	Sparkles,
	Wrench,
	Zap,
} from "lucide-react";
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
			slugs: ["feed-and-posts", "uploading-photos", "videos"],
			icon: Newspaper,
		},
		{
			label: "Interakcje",
			slugs: ["reactions-comments", "family-chat"],
			icon: Heart,
		},
		{
			label: "Organizacja",
			slugs: ["albums", "library", "calendar"],
			icon: FolderOpen,
		},
		{
			label: "Aplikacja",
			slugs: ["notifications-and-pwa", "logging-in", "al-assistant", "for-admins"],
			icon: Sparkles,
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
			icon: Layers,
		},
		{
			label: "Bezpieczeństwo",
			slugs: ["security-and-privacy"],
			icon: ShieldCheck,
		},
		{
			label: "Multimedia i limity",
			slugs: ["photo-upload-pipeline", "video-pipeline", "limits-and-performance"],
			icon: Gauge,
		},
		{
			label: "Czas rzeczywisty",
			slugs: ["realtime-chat", "push-under-the-hood", "pwa-offline"],
			icon: Zap,
		},
		{
			label: "Sztuczna inteligencja",
			slugs: ["al-internals"],
			icon: Bot,
		},
		{
			label: "Dokumentacja",
			slugs: ["docs-under-the-hood"],
			icon: BookOpen,
		},
	],
	bugs: [
		{
			label: "Konto i logowanie",
			slugs: ["magic-link-not-arriving"],
			icon: KeyRound,
		},
		{
			label: "Zdjęcia i filmiki",
			slugs: ["big-photo", "youtube-video-problems", "slow-upload"],
			icon: ImageOff,
		},
		{
			label: "Powiadomienia i czat",
			slugs: ["push-notifications-missing", "chat-messages-missing"],
			icon: BellRing,
		},
		{
			label: "Aplikacja",
			slugs: ["stale-content-cache", "feature-turned-off"],
			icon: Wrench,
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
