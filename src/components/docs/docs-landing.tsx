// SPDX-License-Identifier: AGPL-3.0-or-later
// Docs landing (F1 #204) — główna strona subdomeny docsów: duże logo (jasny/ciemny
// wariant JPEG wg motywu), trzy karty działów, przycisk powrotu do apki.
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { DOC_DEPARTMENT_META } from "@/docs/departments";
import { getDepartmentManifest } from "@/docs/manifest";
import type { DocDepartment } from "@/docs/registry";
import { useAppHref } from "@/docs/use-cross-host-href";
import { cn } from "@/lib/utils";

function docsLogoFor(theme: "light" | "dark" | undefined): string {
	return theme === "light" ? "/logos/wspolniak-docs-light.png" : "/logos/wspolniak-docs.png";
}

function DepartmentCard({ department }: { department: DocDepartment }) {
	const meta = DOC_DEPARTMENT_META.find((d) => d.key === department);
	if (!meta) return null;

	const firstDoc = getDepartmentManifest(department).groups[0]?.docs[0];
	const Icon = meta.icon;

	const card = (
		<div
			className={cn(
				"group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-5 text-left transition-colors",
				firstDoc ? "group-hover:border-primary/50 group-hover:bg-accent/50" : "opacity-60",
			)}
		>
			<div className="flex items-center justify-between">
				<Icon className="size-5 text-primary" aria-hidden />
				{firstDoc ? (
					<ArrowRight
						className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
						aria-hidden
					/>
				) : (
					<span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
						Wkrótce
					</span>
				)}
			</div>
			<h2 className="text-lg font-semibold">{meta.label}</h2>
		</div>
	);

	if (!firstDoc) return card;

	return (
		<Link
			to={`/${department}/${firstDoc.slug}` as never}
			className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{card}
		</Link>
	);
}

export function DocsLanding() {
	const { resolvedTheme } = useTheme();
	// Powrót na GŁÓWNY host apki (nie docs.*) — cookie sesji nie jest współdzielony
	// między hostami, router Link zostawiłby usera na docs.* bez sesji.
	const appHref = useAppHref("/app");

	return (
		<div className="min-h-screen bg-background text-foreground">
			<main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 sm:px-6">
				<img
					src={docsLogoFor(resolvedTheme)}
					alt="Dokumentacja Wspólniaka"
					className="w-72 rounded-2xl"
				/>

				<div className="mt-10 grid w-full gap-4 sm:grid-cols-3">
					{DOC_DEPARTMENT_META.map((department) => (
						<DepartmentCard key={department.key} department={department.key} />
					))}
				</div>

				<Button asChild variant="ghost" className="mt-12 text-muted-foreground">
					<a href={appHref}>
						<ArrowLeft aria-hidden />
						Powrót do Wspólniaka
					</a>
				</Button>
			</main>
		</div>
	);
}
