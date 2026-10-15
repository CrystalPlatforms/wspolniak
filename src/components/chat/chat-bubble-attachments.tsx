// SPDX-License-Identifier: AGPL-3.0-or-later
import { FileArchive, File as FileIcon, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { ImageLightbox } from "@/components/app/image-lightbox";
import type { ChatMessageItem } from "@/components/chat/chat-view";
import type { AttachmentMeta } from "@/db/chat/schema";
import { chatAttachmentUrl, formatBytes, parseAttachmentsPayload } from "./chat-attachments";
import { ChatBubbleText } from "./chat-bubble-text";

/** Ikona karty pliku po typie MIME (PDF/tekst → dokument, zip → archiwum, arkusze → tabela). */
function fileIconFor(mimeType: string): typeof FileIcon {
	if (mimeType.startsWith("text/") || mimeType === "application/pdf") return FileText;
	if (/zip|compressed|tar|x-7z|x-rar/.test(mimeType)) return FileArchive;
	if (/spreadsheet|excel|csv/.test(mimeType)) return FileSpreadsheet;
	return FileIcon;
}

function isImage(attachment: AttachmentMeta): boolean {
	return attachment.mimeType.startsWith("image/");
}

/** Zdjęcie w bąbelku — klik otwiera lightbox (zoom/swipe/pobieranie w środku). */
function AttachmentPhoto({
	attachment,
	onOpen,
}: {
	attachment: AttachmentMeta;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={`Powiększ zdjęcie ${attachment.name}`}
			className="block w-full overflow-hidden rounded-lg"
		>
			<img
				src={chatAttachmentUrl(attachment.key)}
				alt={attachment.name}
				loading="lazy"
				className="max-h-48 w-full object-cover"
			/>
		</button>
	);
}

function AttachmentFileCard({ attachment }: { attachment: AttachmentMeta }) {
	const Icon = fileIconFor(attachment.mimeType);
	return (
		<a
			href={chatAttachmentUrl(attachment.key)}
			download={attachment.name}
			className="flex min-w-40 items-center gap-2 self-start rounded-lg bg-background px-2.5 py-2 text-foreground transition-colors hover:bg-accent"
		>
			<Icon className="size-5 shrink-0" aria-hidden="true" />
			<span className="min-w-0">
				<span className="block truncate text-sm font-medium">{attachment.name}</span>
				<span className="block text-xs text-muted-foreground">{formatBytes(attachment.size)}</span>
			</span>
		</a>
	);
}

/**
 * Bąbelek załączników (F4 #217): zdjęcia jako fotografie (siatka przy wielu;
 * klik otwiera lightbox z powiększeniem i pobieraniem), pliki nieobrazowe jako
 * karty (ikona typu + nazwa + rozmiar, klik pobiera) — wszystko przez
 * autoryzowaną trasę API. Podpis (kolumna `text`) pod załącznikami. Uszkodzony
 * payload → fallback na zwykły tekst, jak w ankietach/lokalizacji.
 */
export function ChatBubbleAttachments({
	message,
	own,
}: {
	message: ChatMessageItem;
	own: boolean;
}) {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const payload = parseAttachmentsPayload(message.payload);
	if (!payload) {
		return <ChatBubbleText text={message.text} own={own} />;
	}

	const { attachments } = payload;
	const images = attachments.filter(isImage);
	const files = attachments.filter((attachment) => !isImage(attachment));
	const firstImage = images[0];

	return (
		<div data-attachments-bubble className="flex min-w-40 flex-col gap-1.5">
			{images.length === 1 && firstImage ? (
				<AttachmentPhoto attachment={firstImage} onOpen={() => setLightboxIndex(0)} />
			) : images.length > 1 ? (
				<div className="grid grid-cols-2 gap-1">
					{images.map((attachment, index) => (
						<AttachmentPhoto
							key={attachment.key}
							attachment={attachment}
							onOpen={() => setLightboxIndex(index)}
						/>
					))}
				</div>
			) : null}
			{files.map((attachment) => (
				<AttachmentFileCard key={attachment.key} attachment={attachment} />
			))}
			{message.text ? <ChatBubbleText text={message.text} own={own} /> : null}
			<ImageLightbox
				images={images.map((attachment) => ({
					id: attachment.key,
					src: chatAttachmentUrl(attachment.key),
					alt: attachment.name,
				}))}
				initialIndex={lightboxIndex ?? 0}
				open={lightboxIndex !== null}
				onClose={() => setLightboxIndex(null)}
			/>
		</div>
	);
}
