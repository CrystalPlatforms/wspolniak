// SPDX-License-Identifier: AGPL-3.0-or-later
import { FileWarning } from "lucide-react";

/** Wpis nieudanego uploadu (POST /api/admin/upload-failures + imię z listy członków). */
export interface UploadFailureEntry {
	id: string;
	userId: string;
	/** Imię rozwiązane przez admina (mapowanie userId → name z listy członków). */
	userName?: string;
	step: string;
	kind: string;
	detail?: string | null;
	fileName?: string | null;
	fileSize?: number | null;
	createdAt: string;
}

interface UploadFailuresSectionProps {
	/** undefined = trwa ładowanie. */
	failures: UploadFailureEntry[] | undefined;
	isLoading: boolean;
}

function formatSize(bytes: number | null | undefined): string | null {
	if (bytes == null) return null;
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sekcja panelu admina: ostatnie nieudane uploady zdjęć (issue #135).
 * Prezentacyjna — dane pobiera trasa /app/admin.
 */
export function UploadFailuresSection({ failures, isLoading }: UploadFailuresSectionProps) {
	return (
		<section className="rounded-lg border border-border bg-card p-4">
			<div className="mb-2 flex items-center gap-2">
				<FileWarning className="h-4 w-4 text-foreground" aria-hidden="true" />
				<h2 className="text-sm font-medium text-foreground">Nieudane uploady</h2>
			</div>

			{isLoading || failures === undefined ? (
				<p className="text-sm text-muted-foreground">Ładowanie...</p>
			) : failures.length === 0 ? (
				<p className="text-sm text-muted-foreground">Brak nieudanych uploadów.</p>
			) : (
				<ul className="space-y-2">
					{failures.map((failure) => {
						const size = formatSize(failure.fileSize);
						return (
							<li
								key={failure.id}
								className="rounded-md border border-border p-2 text-sm text-foreground"
							>
								<div className="flex flex-wrap items-baseline gap-x-2">
									<span className="font-medium">{failure.userName ?? failure.userId}</span>
									<span className="text-muted-foreground">
										{new Date(failure.createdAt).toLocaleString("pl-PL")}
									</span>
								</div>
								<div className="mt-1 text-muted-foreground">
									{failure.step} · {failure.kind}
									{failure.fileName ? ` · ${failure.fileName}` : ""}
									{size ? ` · ${size}` : ""}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
