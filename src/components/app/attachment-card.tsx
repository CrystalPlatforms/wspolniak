// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ComponentType } from "react";

export interface AttachmentCardProps {
	/** Duża ikona treści (pinezka / typ pliku). */
	icon: ComponentType<{ className?: string }>;
	/** Główny wiersz: nazwa miejsca / nazwa pliku. */
	title: string;
	/** Drugi wiersz: współrzędne / rozmiar. */
	subtitle: string;
	/** Jedyna różnica między kartami: przycisk akcji po prawej. */
	actionLabel: string;
	/** Nazwa dostępności przycisku (np. "Pobierz nazwa-pliku.pdf"). */
	actionAriaLabel?: string;
	actionIcon: ComponentType<{ className?: string }>;
	/** Link zewnętrzny (lokalizacja -> mapy); onAction wygrywa, gdy podane. */
	actionHref?: string;
	onAction?: () => void;
}

/**
 * Wspólna karta załącznika w poście (reviza usera: lokalizacja i plik mają
 * IDENTYCZNY styl — ta sama ramka, ikona, dwa wiersze tekstu; jedyna różnica
 * to przycisk akcji po prawej: "Otwórz w mapach" albo "Pobierz").
 */
const ACTION_CLASS =
	"flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary/10 px-5 text-sm font-semibold text-foreground transition-colors hover:bg-primary/20";

export function AttachmentCard({
	icon: Icon,
	title,
	subtitle,
	actionLabel,
	actionAriaLabel,
	actionIcon: ActionIcon,
	actionHref,
	onAction,
}: AttachmentCardProps) {
	const aria = actionAriaLabel ?? actionLabel;
	const action =
		actionHref !== undefined ? (
			<a
				href={actionHref}
				target="_blank"
				rel="noopener noreferrer"
				className={ACTION_CLASS}
				aria-label={aria}
			>
				<ActionIcon className="size-5" aria-hidden="true" />
				{actionLabel}
			</a>
		) : (
			<button type="button" onClick={onAction} className={ACTION_CLASS} aria-label={aria}>
				<ActionIcon className="size-5" aria-hidden="true" />
				{actionLabel}
			</button>
		);

	return (
		<div className="flex items-stretch justify-between gap-3 rounded-md border border-border bg-card p-2">
			<div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2">
				<Icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
				<div className="min-w-0">
					<p className="truncate text-base text-foreground" title={title}>
						{title}
					</p>
					<p className="truncate text-sm tabular-nums text-muted-foreground">{subtitle}</p>
				</div>
			</div>
			{action}
		</div>
	);
}
