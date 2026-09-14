// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/docs/big-photo")({
	component: BigPhotoDocsPage,
});

/**
 * Publiczna strona dokumentacji (issue #200) w konwencji docsów technicznych:
 * breadcrumb, numerowane sekcje, tabele, admonition, ścieżki ustawień w `code`.
 * Linkowana z dialogu „Zdjęcie jest za duże" w kompozytorze.
 */

function Admonition({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<aside className="flex gap-3 rounded-lg border border-border bg-muted/50 p-4">
			<Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
			<div className="space-y-1 text-sm">
				<p className="font-semibold text-foreground">{title}</p>
				<div className="leading-relaxed text-muted-foreground">{children}</div>
			</div>
		</aside>
	);
}

function SettingsPath({ children }: { children: React.ReactNode }) {
	return (
		<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
			{children}
		</code>
	);
}

function Section({
	number,
	title,
	children,
}: {
	number: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="scroll-mt-8 space-y-4" aria-labelledby={`section-${number}`}>
			<h2 id={`section-${number}`} className="border-b border-border pb-2 text-lg font-semibold">
				<span className="mr-2 font-mono text-sm text-muted-foreground">{number}</span>
				{title}
			</h2>
			{children}
		</section>
	);
}

function BigPhotoDocsPage() {
	return (
		<main className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:px-6">
			{/* Powrót — góra strony, lewy róg */}
			<div className="mb-6">
				<Button asChild variant="ghost" className="-ml-2 h-9 text-muted-foreground">
					<Link to="/app">
						<ArrowLeft aria-hidden />
						Powrót do Wspólniaka
					</Link>
				</Button>
			</div>

			{/* Breadcrumb */}
			<nav aria-label="Ścieżka" className="mb-8 text-sm text-muted-foreground">
				<ol className="flex items-center gap-2">
					<li>
						<Link to="/app" className="transition-colors hover:text-foreground">
							Wspólniak
						</Link>
					</li>
					<li aria-hidden>/</li>
					<li>
						<Link to="/docs" className="transition-colors hover:text-foreground">
							Dokumentacja
						</Link>
					</li>
					<li aria-hidden>/</li>
					<li aria-current="page" className="text-foreground">
						Zdjęcia
					</li>
				</ol>
			</nav>

			{/* Nagłówek dokumentu */}
			<header className="mb-10">
				<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
					Zdjęcie przekracza dozwolony rozmiar pliku
				</h1>
			</header>

			<div className="space-y-12">
				<Section number="1" title="Przyczyna">
					<p className="leading-relaxed text-muted-foreground">
						Apary w telefonach rejestrują zdjęcia w rozdzielczości 12–48 Mpx. Rozmiar wynikowego
						pliku zależy od aktywnego trybu aparatu:
					</p>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Tryb aparatu</TableHead>
									<TableHead>Typowy rozmiar pliku</TableHead>
									<TableHead className="text-right">Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell>Standardowy (JPEG / HEIF)</TableCell>
									<TableCell>2–8 MB</TableCell>
									<TableCell className="text-right text-muted-foreground">
										w granicach limitu
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>Wysoka rozdzielczość (48/50 Mpx)</TableCell>
									<TableCell>8–20 MB</TableCell>
									<TableCell className="text-right text-muted-foreground">
										może przekraczać limit
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>Tryb nocny / HDR</TableCell>
									<TableCell>10–25 MB</TableCell>
									<TableCell className="text-right text-muted-foreground">
										może przekraczać limit
									</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>RAW / ProRAW / Expert RAW</TableCell>
									<TableCell>25–75 MB</TableCell>
									<TableCell className="text-right font-medium text-destructive">
										powyżej limitu
									</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</Section>

				<Section number="2" title="Rozwiązanie zalecane — redukcja rozmiaru w aplikacji">
					<p className="leading-relaxed text-muted-foreground">
						Aplikacja oferuje automatyczną redukcję rozmiaru pliku bez zmiany ustawień telefonu:
					</p>
					<ol className="list-decimal space-y-2 pl-5 leading-relaxed text-muted-foreground">
						<li>W widoku kompozytora kliknij miniaturę zdjęcia oznaczoną czerwoną flagą.</li>
						<li>
							W oknie dialogowym „Zdjęcie jest za duże" wybierz{" "}
							<strong className="text-foreground">„Zmniejsz zdjęcie"</strong>.
						</li>
						<li>
							Po zakończeniu (kilka sekund) zdjęcie zastępuje oryginał, a publikacja przebiega
							normalnie.
						</li>
					</ol>
					<Admonition title="Uwaga">
						Redukcja rozmiaru wykonywana jest lokalnie na urządzeniu. Oryginalny plik na telefonie
						pozostaje bez zmian.
					</Admonition>
				</Section>

				<Section number="3" title="Konfiguracja aparatu (opcjonalna)">
					<p className="leading-relaxed text-muted-foreground">
						Aby telefon domyślnie zapisywał mniejsze pliki, zmień poniższe ustawienia:
					</p>
					<div className="space-y-6">
						<div className="space-y-2">
							<h3 className="font-medium">iPhone</h3>
							<ul className="space-y-1.5 leading-relaxed text-muted-foreground">
								<li>
									<SettingsPath>Ustawienia → Aparat → Formaty → Wysoka wydajność</SettingsPath> —
									format HEIF redukuje rozmiar pliku kilkukrotnie względem JPEG.
								</li>
								<li>
									<SettingsPath>
										Ustawienia → Aparat → Formaty → ProRAW i kontrola rozdzielczości
									</SettingsPath>{" "}
									— wyłącz ProRAW lub ustaw rozdzielczość standardową (12 Mpx).
								</li>
							</ul>
						</div>
						<div className="space-y-2">
							<h3 className="font-medium">Google Pixel</h3>
							<ul className="space-y-1.5 leading-relaxed text-muted-foreground">
								<li>
									<SettingsPath>Aparat → Ustawienia → Zapis RAW</SettingsPath> — wyłącz.
								</li>
								<li>
									W trybie zdjęcia wybierz rozdzielczość <SettingsPath>12 Mpx</SettingsPath> zamiast
									pełnej.
								</li>
							</ul>
						</div>
						<div className="space-y-2">
							<h3 className="font-medium">Samsung Galaxy</h3>
							<ul className="space-y-1.5 leading-relaxed text-muted-foreground">
								<li>
									<SettingsPath>Aparat → Ustawienia → Rozmiar zdjęcia</SettingsPath> — ustaw
									mniejszą rozdzielczość (np. 12 Mpx).
								</li>
								<li>
									Oddzielna aplikacja <SettingsPath>Expert RAW</SettingsPath> generuje pliki
									kilkukrotnie przekraczające limit — zalecany zwykły Aparat.
								</li>
							</ul>
						</div>
					</div>
				</Section>

				<Section number="4" title="Parametry techniczne">
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Parametr</TableHead>
									<TableHead>Wartość</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell>Maksymalny rozmiar pliku</TableCell>
									<TableCell>19 MB</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>Obsługiwane formaty</TableCell>
									<TableCell>JPEG, PNG, WebP, HEIC, HEIF</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>Maksymalna liczba zdjęć w poście</TableCell>
									<TableCell>10</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>Przetwarzanie po stronie serwera</TableCell>
									<TableCell>Cloudflare Images (automatyczne warianty rozmiarów)</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</Section>
			</div>
		</main>
	);
}
