// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SkeletonLine } from "@/components/app/post-card-skeleton";
import { SearchResults } from "@/components/app/search-results";
import { cn } from "@/lib/utils";

// Wyszukiwarka (zamiast czatu AL): ?q= w URL jako źródło prawdy — wejście
// z lupki w headerze feeda i z sidebara; wyniki w 3 sekcjach.
export const Route = createFileRoute("/app/search")({
	validateSearch: (search: Record<string, unknown>): { q?: string } => ({
		q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
	}),
	component: SearchScreen,
});

interface SearchResponse {
	data: {
		posts: Parameters<typeof SearchResults>[0]["posts"];
		comments: Parameters<typeof SearchResults>[0]["comments"];
		albums: Parameters<typeof SearchResults>[0]["albums"];
	};
	meta: { imageAccountHash: string };
}

function SearchScreen() {
	const { q } = Route.useSearch();
	const navigate = useNavigate();
	const [input, setInput] = useState(q ?? "");
	// Szkielet żyje do „wyładowania" inputu (koniec animacji lotu) — nawet gdy
	// dane już przyleciały. Awaryjny timeout 700 ms na wypadek wejścia wprost
	// na /search?q=… bez animacji (layoutId nie ma skąd lecieć).
	const [flightDone, setFlightDone] = useState(true);
	const flewRef = useRef(false);
	useEffect(() => {
		if (q !== undefined && !flewRef.current) {
			flewRef.current = true;
			setFlightDone(false);
			const timer = setTimeout(() => setFlightDone(true), 700);
			return () => clearTimeout(timer);
		}
	}, [q]);

	const { data, isPending } = useQuery({
		queryKey: ["search", q],
		queryFn: async (): Promise<SearchResponse> => {
			const res = await fetch(`/api/app/search?q=${encodeURIComponent(q ?? "")}`);
			if (!res.ok) {
				throw new Error(`Search failed: ${res.status}`);
			}
			return res.json();
		},
		enabled: q !== undefined,
	});

	const submit = () => {
		const trimmed = input.trim();
		void navigate({ to: ".", search: { q: trimmed || undefined } });
	};

	if (q === undefined) {
		// Bez zapytania: hero na środku OBSZARU strony (poza sidebarem — mx-auto
		// liczy się od głównego contentu, nie od okna przeglądarki).
		return (
			<div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-2xl flex-col items-center justify-center px-4 pb-28 sm:pb-6">
				<SearchHeader
					input={input}
					setInput={setInput}
					submit={submit}
					showTitle
					onFlightDone={() => {}}
				/>
			</div>
		);
	}

	return (
		<div className="max-w-2xl px-4 py-6 pb-28 sm:pb-6">
			<SearchHeader
				input={input}
				setInput={setInput}
				submit={submit}
				showTitle={false}
				onFlightDone={() => setFlightDone(true)}
			/>
			{/* Taby i wyniki lekko odsunięte w dół od inputu. Szkielet do końca lotu
			    inputu (onLayoutAnimationComplete) + klasyczne isPending. */}
			<div className="mt-6">
				{isPending || !flightDone ? (
					// Skeleton zamiast spinnera: 3 wiersze wyników (kwadrat obrazka + 2 linie).
					<div className="flex flex-col gap-2" aria-busy="true">
						{[0, 1, 2].map((index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: statyczne szkielety dekoracyjne
							<div
								key={index}
								className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
							>
								<div className="size-14 shrink-0 rounded skeleton" />
								<div className="flex-1 space-y-2">
									<SkeletonLine className="w-2/3" />
									<SkeletonLine className="w-1/3" />
								</div>
							</div>
						))}
					</div>
				) : (
					<SearchResults
						query={q}
						posts={data?.data.posts ?? []}
						comments={data?.data.comments ?? []}
						albums={data?.data.albums ?? []}
						accountHash={data?.meta.imageAccountHash ?? ""}
					/>
				)}
			</div>
		</div>
	);
}

interface SearchHeaderProps {
	input: string;
	setInput: (value: string) => void;
	submit: () => void;
	/** Czysty /search pokazuje napis nad inputem; z wynikami napis znika. */
	showTitle: boolean;
	/** Koniec animacji lotu inputu → zwolnij szkielet. */
	onFlightDone: () => void;
}

/** Napis „Wyszukiwarka" nad dużym inputem (tylko bez zapytania), całość
 *  wyśrodkowana; przycisk = ikona lupy tej samej wysokości co input. */
function SearchHeader({ input, setInput, submit, showTitle, onFlightDone }: SearchHeaderProps) {
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-4",
				// Hero czystego /search na środku; z wynikami — do lewej, jak reszta apki.
				showTitle ? "items-center" : "items-start",
			)}
		>
			{showTitle && <h1 className="text-2xl font-bold text-foreground">Wyszukiwarka</h1>}
			{/* layoutId: ten sam rząd inputu w obu widokach — motion animuje lot
			    ze środka strony do lewej-góry przy pierwszym wyszukaniu. */}
			<motion.div
				layoutId="search-input-row"
				onLayoutAnimationComplete={onFlightDone}
				className="flex w-full max-w-xl items-center gap-2"
			>
				<div className="relative flex-1">
					<IconSearch
						className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						type="search"
						value={input}
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") submit();
						}}
						placeholder="Posty, komentarze, albumy…"
						aria-label="Szukaj w archiwum"
						className="h-14 w-full rounded-full border border-border bg-card pl-12 pr-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40"
					/>
				</div>
				<button
					type="button"
					onClick={submit}
					title="Szukaj"
					aria-label="Szukaj"
					className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
				>
					<IconSearch className="size-6" aria-hidden="true" />
				</button>
			</motion.div>
		</div>
	);
}
