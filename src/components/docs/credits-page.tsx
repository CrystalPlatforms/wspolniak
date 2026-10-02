// SPDX-License-Identifier: AGPL-3.0-or-later
// Strona /credits (F6 #209): logo Crystal + tekst autorstwa. Publiczna jak reszta
// docsow; dociera sie do niej z linku przypietego na dole sidebara kazdego dzialu.
// Oba przyciski powrotu sa na GORZE (obok siebie), jak w DocPage.

import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppHref, useDocsHref } from "@/docs/use-cross-host-href";

export function CreditsPage() {
	// Powrot na GLOWNY host apki — cookie sesji nie jest wspoldzielony z docs.*.
	const appHref = useAppHref("/app");
	// Powrot do dokumentacji = landing docsow (ten sam host, pelny URL po mount).
	const docsHref = useDocsHref("/");

	return (
		<div className="min-h-screen bg-background text-foreground">
			<main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 sm:px-6">
				<div className="flex flex-wrap items-center gap-2 self-start">
					<Button asChild variant="ghost" className="-ml-2 h-9 text-muted-foreground">
						<a href={appHref}>
							<ArrowLeft aria-hidden />
							Powrót do Wspólniaka
						</a>
					</Button>
					<Button asChild variant="ghost" className="h-9 text-muted-foreground">
						<a href={docsHref}>
							<BookOpen aria-hidden />
							Powrót do dokumentacji
						</a>
					</Button>
				</div>

				<img
					src="/logos/CrystalLogo.png"
					alt="Crystal"
					className="mt-16 w-40 rounded-2xl border border-border"
				/>
				<h1 className="mt-8 text-xl font-semibold">Wspólniak został stworzony przez Crystal</h1>
			</main>
		</div>
	);
}
