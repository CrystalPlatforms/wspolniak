// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	IconDownload,
	IconFile,
	IconFileDescription,
	IconFileText,
	IconFileZip,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { AttachmentCard } from "@/components/app/attachment-card";
import { formatPostFileSize } from "@/components/app/composer-files-section";
import type { PostFileEntry } from "@/db/post-files/schema";
import { isAndroidWrapper, saveBlobViaBridge } from "@/lib/download-image";

/** URL pobierania załącznika — prywatny bucket, więc tylko autoryzowana trasa API. */
function postFileUrl(postId: string, fileId: string): string {
	return `/api/app/posts/${postId}/files/${fileId}`;
}

/** Ikona wg typu MIME (spójny zestaw: PDF/dokument/zip/reszta). */
function iconForMime(mimeType: string): ComponentType<{ className?: string }> {
	if (mimeType === "application/pdf") return IconFileDescription;
	if (mimeType.includes("zip")) return IconFileZip;
	if (mimeType.startsWith("text/")) return IconFileText;
	return IconFile;
}

/**
 * Pobieranie załącznika (#243): fetch z ciasteczkiem sesji do autoryzowanego
 * endpointu, potem zapis blobem. W powłoce Androida bajty przekazuje mostek
 * (MediaStore Downloads) — ta sama droga co pobieranie zdjęć (#225).
 */
async function downloadPostFile(postId: string, file: PostFileEntry): Promise<void> {
	try {
		const response = await fetch(postFileUrl(postId, file.id));
		if (!response.ok) {
			toast.error("Nie udało się pobrać pliku");
			return;
		}
		const blob = await response.blob();
		if (isAndroidWrapper()) {
			await saveBlobViaBridge(blob, file.name);
			return;
		}
		const blobUrl = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = blobUrl;
		link.download = file.name;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(blobUrl);
	} catch {
		toast.error("Nie udało się pobrać pliku");
	}
}

interface PostFilesListProps {
	postId: string;
	files: PostFileEntry[];
}

/**
 * Lista załączników posta (#243): wiersze ikona/nazwa/rozmiar + przycisk
 * pobierz. Render poniżej zdjęć i wideo; zero podglądów (PRD: pliki to
 * archiwalne oryginały, bez miniatur).
 */
export function PostFilesList({ postId, files }: PostFilesListProps) {
	if (files.length === 0) return null;

	return (
		<div data-post-files className="space-y-1">
			<ul className="flex flex-col gap-1">
				{files.map((file) => {
					const IconComponent = iconForMime(file.mimeType);
					return (
						<li key={file.id}>
							<AttachmentCard
								icon={IconComponent}
								title={file.name}
								subtitle={formatPostFileSize(file.size)}
								actionLabel="Pobierz"
								actionAriaLabel={`Pobierz ${file.name}`}
								actionIcon={IconDownload}
								onAction={() => void downloadPostFile(postId, file)}
							/>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
