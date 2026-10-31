// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	IconArrowRight,
	IconBrandGithub,
	IconCamera,
	IconHeart,
	IconLock,
	IconRocket,
	IconServer,
	IconShield,
	IconUsers,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
	{
		icon: IconLock,
		title: "Pełna prywatność",
		description:
			"Żadnych zewnętrznych serwisów. Zdjęcia trafiają wyłącznie na Twoją instancję — nikt poza rodziną ich nie zobaczy.",
	},
	{
		icon: IconServer,
		title: "Własny hosting",
		description:
			"Deploy jednym kliknięciem na Cloudflare Workers. Twoja infrastruktura, Twoje zasady, zero miesięcznych opłat.",
	},
	{
		icon: IconUsers,
		title: "Dla całej rodziny",
		description: "Zaproś bliskich przez magic link — bez haseł i rejestracji. Babcia też da radę.",
	},
	{
		icon: IconShield,
		title: "Bez śledzenia",
		description:
			"Zero analityki, zero reklam, zero sprzedawania danych. Wspólniak nie wie o Tobie nic ponad to, co sam podasz.",
	},
	{
		icon: IconCamera,
		title: "Wspólne albumy",
		description:
			"Każdy członek rodziny może dodawać zdjęcia. Wspomnienia z wakacji, urodzin i codzienności — w jednym miejscu.",
	},
	{
		icon: IconHeart,
		title: "Open source",
		description:
			"Kod jest otwarty. Sprawdź co robi, zaproponuj zmianę, dostosuj do swoich potrzeb.",
	},
];

interface LandingPageProps {
	isAuthenticated?: boolean;
}

export function LandingPage({ isAuthenticated }: LandingPageProps) {
	return (
		<div className="min-h-screen bg-background">
			{/* Hero */}
			<section className="flex flex-col items-center justify-center px-6 py-24 sm:py-32">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-7xl">
						Wspólniak
					</h1>

					<p className="mt-6 text-xl leading-8 text-muted-foreground">
						Prywatne udostępnianie zdjęć dla Twojej rodziny. Hostuj na własnej instancji Cloudflare
						Workers — Twoje zdjęcia, Twoje dane, zero pośredników.
					</p>

					<div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
						{isAuthenticated ? (
							<Button size="lg" asChild>
								<Link to="/app">
									Przejdź do aplikacji
									<IconArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
								</Link>
							</Button>
						) : (
							<Button size="lg" asChild>
								<a
									href="https://deploy.workers.cloudflare.com/?url=https://github.com/CrystalPlatforms/wspolniak"
									target="_blank"
									rel="noopener noreferrer"
								>
									<IconRocket className="mr-2 h-4 w-4" aria-hidden="true" />
									Deploy to Cloudflare
								</a>
							</Button>
						)}

						<Button variant="outline" size="lg" asChild>
							<a
								href="https://github.com/CrystalPlatforms/wspolniak"
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconBrandGithub className="mr-2 h-4 w-4" aria-hidden="true" />
								GitHub
							</a>
						</Button>
					</div>
				</div>
			</section>

			{/* How it works */}
			<section className="border-t border-border bg-muted/30 px-6 py-24">
				<div className="mx-auto max-w-3xl">
					<h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
						Jak to działa?
					</h2>
					<p className="mt-4 text-center text-muted-foreground">
						Trzy kroki do prywatnego albumu rodzinnego
					</p>

					<ol className="mt-12 space-y-8">
						<li className="flex gap-4">
							<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
								1
							</span>
							<div>
								<h3 className="font-semibold text-foreground">Wdróż instancję</h3>
								<p className="mt-1 text-muted-foreground">
									Kliknij &ldquo;Deploy to Cloudflare&rdquo; i postępuj zgodnie z instrukcjami. Cały
									proces zajmuje kilka minut.
								</p>
							</div>
						</li>
						<li className="flex gap-4">
							<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
								2
							</span>
							<div>
								<h3 className="font-semibold text-foreground">Skonfiguruj rodzinę</h3>
								<p className="mt-1 text-muted-foreground">
									Wejdź na swoją instancję, podaj nazwę rodziny i imię admina. Otrzymasz magic link
									— to Twój klucz dostępu.
								</p>
							</div>
						</li>
						<li className="flex gap-4">
							<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
								3
							</span>
							<div>
								<h3 className="font-semibold text-foreground">Zaproś bliskich</h3>
								<p className="mt-1 text-muted-foreground">
									Wygeneruj magic linki dla członków rodziny. Każdy wchodzi przez swój link — bez
									haseł i kont.
								</p>
							</div>
						</li>
					</ol>
				</div>
			</section>

			{/* Features */}
			<section className="px-6 py-24">
				<div className="mx-auto max-w-5xl">
					<h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
						Dlaczego Wspólniak?
					</h2>
					<p className="mt-4 text-center text-muted-foreground">
						Bo rodzinne zdjęcia nie powinny leżeć na cudzych serwerach
					</p>

					<div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{features.map((feature) => {
							const Icon = feature.icon;
							return (
								<Card key={feature.title}>
									<CardHeader>
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
											<Icon className="h-5 w-5 text-primary" />
										</div>
										<CardTitle className="text-lg">{feature.title}</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-sm leading-relaxed text-muted-foreground">
											{feature.description}
										</p>
									</CardContent>
								</Card>
							);
						})}
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="border-t border-border px-6 py-8">
				<div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
					<p className="text-sm text-muted-foreground">
						Wspólniak &mdash; open source, AGPL-3.0-or-later
					</p>
					<a
						href="https://github.com/CrystalPlatforms/wspolniak"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<IconBrandGithub className="h-4 w-4" aria-hidden="true" />
						CrystalPlatforms/wspolniak
					</a>
				</div>
			</footer>
		</div>
	);
}
