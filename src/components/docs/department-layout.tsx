// SPDX-License-Identifier: AGPL-3.0-or-later
// Layout dzialu docsow (F5 #208 + poprawki ownera 2026-10-02): sidebar BranchedMenu
// z manifestu dzialu w trzech trybach — rozwiniety, zwiniety do rynny ikon (bez
// zamykania) i calkowicie ukryty (przywrocony przyciskiem nad trescia). Pod logo
// przelacznik dzialow z loaderem przy wolnej nawigacji; ThemeToggle z napisem nad Credits;
// logo bez napisu, podwojonej wielkosci; ciasne odstepy, dlugie tytuly z elipsa.

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	ArrowLeft,
	BookOpen,
	Check,
	ChevronDown,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	ScrollText,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader } from "@/components/ui/loader";
import { DOC_DEPARTMENT_META } from "@/docs/departments";
import { getDepartmentManifest } from "@/docs/manifest";
import type { DocDepartment } from "@/docs/registry";
import { useAppHref, useDocsHref } from "@/docs/use-cross-host-href";
import { cn } from "@/lib/utils";
import BranchedMenu from "./branched-menu";

function docsLogoFor(theme: "light" | "dark" | undefined): string {
	return theme === "light" ? "/logos/wspolniak-docs-light.png" : "/logos/wspolniak-docs.png";
}

/** Tryby sidebara: rozwiniety albo calkowicie ukryty (zwijanie usuniete wg ownera). */
type SidebarMode = "expanded" | "hidden";

/** Sciezka pierwszego dokumentu dzialu (do przelacznika kategorii). */
function firstDocPath(department: DocDepartment): string | null {
	const first = getDepartmentManifest(department).groups[0]?.docs[0];
	return first ? `/${department}/${first.slug}` : null;
}

interface DepartmentSwitcherProps {
	department: DocDepartment;
	onNavigate?: () => void;
}

/** Przelacznik kategorii (dzialow) pod logo — z loaderem przy wolnym laczu. */
function DepartmentSwitcher({ department, onNavigate }: DepartmentSwitcherProps) {
	const navigate = useNavigate();
	const isPending = useRouterState({ select: (state) => state.status === "pending" });
	const current = DOC_DEPARTMENT_META.find((meta) => meta.key === department);

	const switchTo = (next: DocDepartment) => {
		if (next === department) return;
		const path = firstDocPath(next);
		if (!path) return;
		void navigate({ to: path as never });
		onNavigate?.();
	};

	return (
		<div className="w-full">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="w-full justify-between">
						<span className="flex items-center gap-2">
							{current ? <current.icon aria-hidden className="size-4" /> : null}
							{current?.label}
						</span>
						<ChevronDown aria-hidden className="size-4 opacity-60" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{DOC_DEPARTMENT_META.map((meta) => (
						<DropdownMenuItem key={meta.key} onClick={() => switchTo(meta.key)}>
							<meta.icon aria-hidden className="size-4 text-muted-foreground" />
							{meta.label}
							{meta.key === department && <Check aria-hidden className="ml-auto size-4" />}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			{/* Slabe lacze: podczas nawigacji miedzy dzialami pokazujemy nasz loader. */}
			{isPending && <Loader size={4} className="mt-3 justify-center" />}
		</div>
	);
}

interface SidebarContentProps {
	department: DocDepartment;
	/** Pelna sciezka aktywnego dokumentu — podswietlenie w menu. */
	activePath?: string;
	/** Wywolywane po wyborze dokumentu — zamyka mobilny drawer. */
	onNavigate?: () => void;
	/** Przycisk ukrycia sidebara w dolnym rzedzie (tylko desktop; drawer bez niego). */
	onHide?: () => void;
}

/** Rozwinieta zawartosc sidebara: logo, przelacznik dzialow, menu, ThemeToggle, Credits. */
function SidebarContent({ department, activePath, onNavigate, onHide }: SidebarContentProps) {
	const navigate = useNavigate();
	const { resolvedTheme } = useTheme();
	// Powroty (na glowny host apki / na landing docsow) zyja teraz w sidebarze
	// nad Credits — przeniesione z DocPage wg ownera.
	const appHref = useAppHref("/app");
	const docsHref = useDocsHref("/");
	const manifest = getDepartmentManifest(department);
	const isLight = resolvedTheme === "light";

	const items = manifest.groups.map((group) => ({
		label: group.label,
		children: group.docs.map((doc) => ({
			value: `/${department}/${doc.slug}`,
			label: doc.title,
			icon: <doc.icon className="size-4" aria-hidden />,
		})),
	}));

	return (
		<div className="flex h-full min-w-0 flex-col">
			<Link
				to="/"
				className="self-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<img src={docsLogoFor(resolvedTheme)} alt="Dokumentacja Wspólniaka" className="size-48" />
			</Link>
			<div className="mt-3">
				<DepartmentSwitcher department={department} onNavigate={onNavigate} />
			</div>
			{/* Ciasny indent (24) zamiast domyslnego 40 — wiecej miejsca na dlugie tytuly. */}
			<div className="mt-4 min-h-0 flex-1 overflow-y-auto">
				<BranchedMenu
					items={items}
					defaultOpen={manifest.groups.map((_, index) => index)}
					defaultActive={activePath}
					color={isLight ? "#18181b" : "#f5f5f5"}
					accentColor={isLight ? "#18181b" : "#f5f5f5"}
					lineColor={isLight ? "#d4d4d8" : "#3f3f46"}
					onSelect={(value) => {
						void navigate({ to: value as never });
						onNavigate?.();
					}}
				/>
			</div>

			<div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
				{/* Powroty w tym samym stylu co Credits (czysty link, bez ramki przycisku). */}
				<a
					href={appHref}
					className="flex items-start gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft aria-hidden className="mt-0.5 size-4 shrink-0" />
					<span className="leading-snug">Powrót do Wspólniaka</span>
				</a>
				<a
					href={docsHref}
					className="flex items-start gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<BookOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
					<span className="leading-snug">Powrót do strony głównej dokumentacji</span>
				</a>
				<Link
					to="/credits"
					className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ScrollText aria-hidden className="size-4" />
					Twórcy
				</Link>
				{/* Motyw POD Credits (wg ownera). */}
				<div className="flex w-full items-center gap-2">
					<ThemeToggle showLabel className="min-w-0 flex-1 justify-start" />
					{onHide && (
						<Button variant="ghost" size="icon" onClick={onHide} aria-label="Ukryj sidebar">
							<PanelLeftClose aria-hidden className="size-4" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

export interface DepartmentLayoutProps {
	department: DocDepartment;
	/** Slug aktywnego dokumentu — podswietlenie w sidebarze (router-driven). */
	activeSlug?: string;
	children: ReactNode;
}

export function DepartmentLayout(props: DepartmentLayoutProps) {
	const [mode, setMode] = useState<SidebarMode>("expanded");
	const [drawerOpen, setDrawerOpen] = useState(false);
	const { resolvedTheme } = useTheme();
	const activePath = props.activeSlug ? `/${props.department}/${props.activeSlug}` : undefined;

	const [drawerMounted, setDrawerMounted] = useState(false);
	const closeDrawer = () => setDrawerOpen(false);
	const openDrawer = () => {
		setDrawerMounted(true);
		setDrawerOpen(true);
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			{/* Mobile topbar: hamburger + samo logo (bez napisu). */}
			<div className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
				<Button
					variant="ghost"
					size="icon"
					onClick={openDrawer}
					aria-label="Otwórz nawigację dokumentacji"
				>
					<Menu aria-hidden className="size-5" />
				</Button>
				<Link
					to="/"
					className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<img src={docsLogoFor(resolvedTheme)} alt="Dokumentacja Wspólniaka" className="size-20" />
				</Link>
			</div>
			{/* Bez mx-auto/max-w: sidebar przy LEWEJ krawedzi okna; tresc centruje
					sie sama w swojej kolumnie (DocPage ma wlasne max-w-3xl). */}
			<div className="flex w-full min-w-0 items-start">
				{/* Desktop: sidebar — animowane wysuwanie/wsuwanie przy ukrywaniu. */}
				<aside
					data-mode={mode}
					className={cn(
						// Kolumna zjezdza w lewo (-ml) i kolapsuje (w-0), tresc przycina
						// overflow-hidden; motion-reduce wylacza ruch.
						"sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-border px-2 py-4 transition-all duration-300 ease-in-out motion-reduce:transition-none lg:flex lg:w-64",
						// UWAGA: nadpisania MUSZA miec prefiks lg: — w przeciwnym razie przegrywaja
						// z lg:w-64 i kolumna zostaje czesciowo widoczna (bug z review).
						mode === "hidden" && "lg:-ml-64 lg:w-0 lg:border-r-0 lg:p-0",
					)}
				>
					<div className="min-h-0 flex-1">
						<SidebarContent
							department={props.department}
							activePath={activePath}
							onHide={() => setMode("hidden")}
						/>
					</div>
				</aside>
				<div className="min-w-0 flex-1">{props.children}</div>
			</div>

			{/* Desktop: sidebar calkowicie ukryty — DWA przyciski przywrocenia (gor + dol). */}
			{mode === "hidden" && (
				<>
					<Button
						variant="ghost"
						size="icon"
						className="fixed left-3 top-3 z-40 hidden lg:flex"
						onClick={() => setMode("expanded")}
						aria-label="Pokaż sidebar"
					>
						<PanelLeftOpen aria-hidden className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="fixed bottom-3 left-3 z-40 hidden lg:flex"
						onClick={() => setMode("expanded")}
						aria-label="Pokaż sidebar"
					>
						<PanelLeftOpen aria-hidden className="size-4" />
					</Button>
				</>
			)}

			{/* Mobile drawer — pelna zawartosc sidebara; wybor dokumentu go zamyka.
			    Zawsze zamontowany: panel wysuwa sie z lewej (translate), tlo fadeuje;
			    inert wylacza interakcje i a11y, gdy jest zamkniety. */}
			{drawerMounted && (
				<div
					className={cn("fixed inset-0 z-50 lg:hidden", !drawerOpen && "pointer-events-none")}
					role="dialog"
					aria-modal="true"
					aria-label="Nawigacja dokumentacji"
					aria-hidden={!drawerOpen}
					inert={!drawerOpen}
				>
					<button
						type="button"
						className={cn(
							"absolute inset-0 bg-black/50 transition-opacity duration-300 ease-in-out motion-reduce:transition-none",
							drawerOpen ? "opacity-100" : "opacity-0",
						)}
						aria-label="Zamknij nawigację dokumentacji"
						onClick={closeDrawer}
						tabIndex={drawerOpen ? 0 : -1}
					/>
					<aside
						className={cn(
							"absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-border bg-background p-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
							drawerOpen ? "translate-x-0" : "-translate-x-full",
						)}
					>
						<div className="mb-2 flex justify-end">
							<Button
								variant="ghost"
								size="icon"
								onClick={closeDrawer}
								aria-label="Zamknij nawigację dokumentacji"
							>
								<X aria-hidden className="size-5" />
							</Button>
						</div>
						<SidebarContent
							department={props.department}
							activePath={activePath}
							onNavigate={closeDrawer}
						/>
					</aside>
				</div>
			)}
		</div>
	);
}
