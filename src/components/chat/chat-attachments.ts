// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	type AttachmentMeta,
	type AttachmentsPayload,
	attachmentsPayloadSchema,
	MAX_CHAT_ATTACHMENT_BYTES,
	MAX_CHAT_ATTACHMENTS,
} from "@/db/chat";
import { ShrinkError, shrinkImageToLimit } from "@/images/shrink";

/** URL pobierania załącznika — prywatny bucket, więc tylko autoryzowana trasa API. */
export function chatAttachmentUrl(key: string): string {
	return `/api/chat/attachments/${key}`;
}

/** Plik odrzucony przy wyborze — nazwa + powód do toastu (AC #217: widoczny komunikat). */
interface RejectedFile {
	name: string;
	reason: string;
}

/** Wynik przygotowania plików: te dopuszczone (już zmniejszone) i odrzucone z powodami. */
export interface AttachmentPrepResult {
	accepted: File[];
	rejected: RejectedFile[];
}

/** Powód odrzucenia pliku (typ MIME / rozmiar) albo `null`, gdy plik może lecieć. */
function fileRejection(file: File): string | null {
	const mimeType = file.type || "application/octet-stream";
	if (mimeType.startsWith("video/")) return "pliki wideo nie są obsługiwane";
	if (file.size > MAX_CHAT_ATTACHMENT_BYTES) return "przekracza limit 19 MB";
	return null;
}

/**
 * Zdjęcie przez pipeline #200 (`shrinkImageToLimit` — bez forka). Gdy zmniejszanie
 * nie wystarcza, a oryginał mieści się w limicie — zostaje oryginał; inaczej
 * powód odrzucenia dla toastu.
/**
 * Zdjęcie przez pipeline #200 (`shrinkImageToLimit` — bez forka). Oryginał
 * przeszedł już bramkę 19 MB, więc gdy zmniejszanie nie da lepszego wyniku,
 * po prostu zostaje oryginał (zmniejszanie jest optymalizacją, nie warunkiem).
 */
async function shrinkImageFile(file: File): Promise<File> {
	try {
		return await shrinkImageToLimit(file, MAX_CHAT_ATTACHMENT_BYTES);
	} catch (error) {
		if (!(error instanceof ShrinkError)) throw error;
		return file;
	}
}

/**
 * Walidacja + przygotowanie plików z wybierarki (F4 #217): wideo i pliki ponad
 * 19 MB odrzucane z komunikatem; zdjęcia przechodzą przez pipeline zmniejszania
 * z #200, żeby wysyłka była szybka. Limit liczby plików liczy się względem
 * załączników już wybranych do wiadomości.
 */
export async function prepareAttachments(
	files: File[],
	existingCount: number,
): Promise<AttachmentPrepResult> {
	const accepted: File[] = [];
	const rejected: RejectedFile[] = [];

	for (const file of files) {
		const rejection = fileRejection(file);
		if (rejection) {
			rejected.push({ name: file.name, reason: rejection });
			continue;
		}
		if (existingCount + accepted.length >= MAX_CHAT_ATTACHMENTS) {
			rejected.push({
				name: file.name,
				reason: `limit ${MAX_CHAT_ATTACHMENTS} plików na wiadomość`,
			});
			continue;
		}
		const mimeType = file.type || "application/octet-stream";
		if (mimeType.startsWith("image/")) {
			accepted.push(await shrinkImageFile(file));
			continue;
		}
		accepted.push(file);
	}

	return { accepted, rejected };
}

/**
 * Upload załączników (F4 #217): multipart POST przez Workera do R2. Zwraca
 * metadane w kolejności plików — dokładnie to, co leci do payloadu wiadomości.
 */
export async function uploadChatAttachments(files: File[]): Promise<AttachmentMeta[]> {
	const formData = new FormData();
	for (const file of files) {
		formData.append("files", file, file.name);
	}
	const res = await fetch("/api/chat/attachments", { method: "POST", body: formData });
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(body?.error ?? "Nie udało się wysłać załączników");
	}
	const json = (await res.json()) as { data: { attachments: AttachmentMeta[] } };
	return json.data.attachments;
}

/** Payload załączników z wiadomości — defensywnie Zodem (uszkodzony → null, fallback tekstowy). */
export function parseAttachmentsPayload(payload: unknown): AttachmentsPayload | null {
	const parsed = attachmentsPayloadSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

/** Rozmiar pliku po ludzku (pl-PL): „512 B", „12,5 KB", „3,2 MB". */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} KB`;
	}
	return `${(bytes / (1024 * 1024)).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} MB`;
}
