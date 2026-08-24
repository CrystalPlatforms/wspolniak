// SPDX-License-Identifier: AGPL-3.0-or-later
import { Pencil, Trash2 } from "lucide-react";

/** Miesiące w dopełniaczu — „1 stycznia", „15 marca" (#163). */
const MONTHS_PL_GENITIVE = [
	"stycznia",
	"lutego",
	"marca",
	"kwietnia",
	"maja",
	"czerwca",
	"lipca",
	"sierpnia",
	"września",
	"października",
	"listopada",
	"grudnia",
] as const;

/** Formatuje datę wydarzenia: „15 marca" (mała litera, dopełniacz). */
export function formatEventDate(day: number, month: number): string {
	const monthName = MONTHS_PL_GENITIVE[month - 1] ?? "";
	return `${day} ${monthName}`.trim();
}

export interface CalendarEventDTO {
	id: string;
	title: string;
	description: string | null;
	day: number;
	month: number;
}

interface CalendarGridProps {
	events: CalendarEventDTO[];
	/** Admin widzi na kafelkach przyciski edytuj/usuń (CRUD poza gridem). */
	isAdmin?: boolean;
	onEdit?: (event: CalendarEventDTO) => void;
	onDelete?: (event: CalendarEventDTO) => void;
}

/**
 * Grid kafelków kalendarza (#163): 2 kafelki obok siebie, w dół bez limitu.
 * Kafelek = pogrubiona data + tytuł; opis celowo niewyświetlany. Kolejność
 * wydarzeń przychodzi posortowana z API (miesiąc, dzień).
 */
export function CalendarGrid({ events, isAdmin = false, onEdit, onDelete }: CalendarGridProps) {
	return (
		<div className="grid grid-cols-2 gap-3" data-slot="calendar-grid">
			{events.map((event) => (
				<div key={event.id} className="flex flex-col rounded-lg border border-border bg-card p-4">
					<p className="text-lg font-bold text-foreground">
						{formatEventDate(event.day, event.month)}
					</p>
					<p className="mt-1 text-sm text-foreground">{event.title}</p>
					{isAdmin && (
						<div className="mt-3 flex gap-1 self-end">
							<button
								type="button"
								title="Edytuj"
								aria-label={`Edytuj ${event.title}`}
								onClick={() => onEdit?.(event)}
								className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								<Pencil className="h-5 w-5" />
							</button>
							<button
								type="button"
								title="Usuń"
								aria-label={`Usuń ${event.title}`}
								onClick={() => onDelete?.(event)}
								className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
							>
								<Trash2 className="h-5 w-5" />
							</button>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
