// SPDX-License-Identifier: AGPL-3.0-or-later
import { useNavigate } from "@tanstack/react-router";
import { Search, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BeamBorder } from "@/components/app/beam-border";
import { cn } from "@/lib/utils";

interface FeedSearchBarProps {
	query: string;
	onQueryChange: (query: string) => void;
}

/**
 * Wyszukiwarka feedu (F7 #185). Beam jeździ przy pustym polu i staje na czas
 * pisania; klik (focus) rozwija pasek i przykleja go do góry ekranu,
 * klik obok zwija. Filtrowanie live robi rodzic przez filterPosts;
 * przycisk wyślij prowadzi na /app/ai i automatycznie wysyła zapytanie.
 */
export function FeedSearchBar({ query, onQueryChange }: FeedSearchBarProps) {
	const [expanded, setExpanded] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	useEffect(() => {
		if (!expanded) return;
		const onPointerDown = (event: PointerEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setExpanded(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [expanded]);

	// Zapytanie jedzie w URL jako search param ?q= — po wylądowaniu na /app/ai
	// strona je wysyła i czyści param, więc refresh nie powtórzy wysyłki.
	const sendToAl = () => {
		if (!query.trim()) return;
		void navigate({ to: "/app/ai", search: { q: query.trim() } });
	};

	return (
		<div
			ref={containerRef}
			className={cn(
				"sticky top-0 z-30 -mx-4 bg-background/95 px-4 backdrop-blur transition-all",
				expanded ? "py-3 shadow-md" : "py-2",
			)}
		>
			<BeamBorder variant="line" active={query.trim() === ""} className="rounded-full">
				<div className="flex items-center gap-2 rounded-full border border-primary/30 bg-card pl-4 pr-2">
					<Search className="size-5 shrink-0 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						onFocus={() => setExpanded(true)}
						placeholder="Szukaj w feedzie…"
						aria-label="Szukaj w feedzie"
						className={cn(
							"flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground transition-all",
							expanded ? "h-12 text-base" : "h-10 text-sm",
						)}
					/>
					<button
						type="button"
						onClick={sendToAl}
						aria-label="Wyślij zapytanie do AL"
						className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						<SendHorizontal className="size-5" />
					</button>
				</div>
			</BeamBorder>
		</div>
	);
}
