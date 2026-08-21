// SPDX-License-Identifier: AGPL-3.0-or-later
import "./post-card-skeleton.css";

/** Domyślna liczba linii opisu w szkieletie (kadans ~24 px jak zwykły tekst). */
const SKELETON_DESCRIPTION_LINES = 3;

/** Domyślna liczba slotów zdjęć — tyle, ile maksymalnie widoczne w feedzie. */
export const SKELETON_IMAGE_SLOTS = 2;

/** Pojedyncza szara linia szkieletu z shimmerem. */
function SkeletonLine({ className = "" }: { className?: string }) {
	return <div aria-hidden="true" className={`skeleton h-4 rounded-sm ${className}`} />;
}

/** Nagłówek karty: pasek autora, pasek czasu, słupki akcji po prawej. */
export function SkeletonHeader() {
	return (
		<div className="mb-2 flex items-center gap-2" data-testid="skeleton-header">
			<SkeletonLine className="h-5 w-28" />
			<SkeletonLine className="w-16" />
			<div className="ml-auto flex items-center gap-1">
				<SkeletonLine className="size-6 rounded-md" />
				<SkeletonLine className="size-6 rounded-md" />
			</div>
		</div>
	);
}

/** Blok opisu: stałe 3 linie, ostatnia krótsza — wysokość jak typowy post tekstowy. */
export function SkeletonDescription({ lines = SKELETON_DESCRIPTION_LINES }: { lines?: number }) {
	return (
		<div className="mb-3 space-y-2" data-testid="skeleton-description" aria-hidden="true">
			{Array.from({ length: lines }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: statyczna lista dekoracyjna o stałej długości
				<SkeletonLine key={index} className={index === lines - 1 ? "w-2/3" : "w-full"} />
			))}
		</div>
	);
}

/** Sloty zdjęć w tej samej siatce co PostCard — stałe proporcje, zero shiftu. */
export function SkeletonImageSlots({ count = SKELETON_IMAGE_SLOTS }: { count?: number }) {
	return (
		<div
			className="grid grid-cols-2 gap-2 sm:grid-cols-3"
			data-testid="skeleton-images"
			aria-hidden="true"
		>
			{Array.from({ length: count }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: statyczna lista dekoracyjna o stałej długości
				<div key={index} className="skeleton aspect-square w-full rounded-md" />
			))}
		</div>
	);
}

/** Pasek reakcji/komentarzy: lewy dłuższy, prawy krótszy (wysokości jak linki w karcie). */
export function SkeletonMeta() {
	return (
		<div className="mt-3 flex items-center justify-between" data-testid="skeleton-meta">
			<SkeletonLine className="h-10 w-40 rounded-md sm:h-7" />
			<SkeletonLine className="h-10 w-24 rounded-md sm:h-7" />
		</div>
	);
}

interface PostCardSkeletonProps {
	/** Liczba slotów zdjęć (domyślnie jak w feedzie: 2). */
	imageCount?: number;
	/** Czy renderować linie opisu (domyślnie tak). */
	hasDescription?: boolean;
}

/**
 * Pełny szkielet karty posta — lustro układu PostCard (#145). Używany, gdy dane
 * strony feedu jeszcze lecą (isPending); pojedyncze kawałki (SkeletonHeader itd.)
 * reużywa PostCard do podmiany ukrytych etapów choreografii.
 */
export function PostCardSkeleton({
	imageCount = SKELETON_IMAGE_SLOTS,
	hasDescription = true,
}: PostCardSkeletonProps) {
	return (
		<article className="relative rounded-lg border border-border bg-card p-4" aria-hidden="true">
			<SkeletonHeader />
			{hasDescription && <SkeletonDescription />}
			{imageCount > 0 && <SkeletonImageSlots count={imageCount} />}
			<SkeletonMeta />
		</article>
	);
}
