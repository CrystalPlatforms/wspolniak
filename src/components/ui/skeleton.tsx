// SPDX-License-Identifier: AGPL-3.0-or-later
import { cn } from "@/lib/utils";

/**
 * Prymityw skeletona — TEN SAM styl co wszędzie (.skeleton z post-card-skeleton.css:
 * ten sam shimmer, kolory i animacja). Od revizy usera zastępuje spinnerowe stany
 * ładowania EKRANÓW — spany wewnątrz przycisków (mutacje) zostają Loaderem.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} {...props} />;
}

/**
 * Pełnoekranowy skeleton ładowania aplikacji/ścieżki (zamiast Loadera):
 * układ lustrzany do ekranów aplikacji — nagłówek, karta treści, linie, kafelki.
 */
export function ScreenSkeleton() {
	return (
		<div className="min-h-dvh bg-background p-6" aria-busy="true">
			<div className="mx-auto max-w-2xl space-y-4">
				<div className="flex items-center gap-3">
					<Skeleton className="size-12 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-1/3" />
						<Skeleton className="h-3 w-1/4" />
					</div>
				</div>
				<Skeleton className="h-32 rounded-lg" />
				<div className="space-y-2">
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-5/6" />
					<Skeleton className="h-3 w-2/3" />
				</div>
				<div className="grid grid-cols-2 gap-3">
					<Skeleton className="aspect-square rounded-lg" />
					<Skeleton className="aspect-square rounded-lg" />
				</div>
			</div>
		</div>
	);
}
