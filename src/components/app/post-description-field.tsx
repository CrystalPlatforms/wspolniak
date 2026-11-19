// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense } from "react";
import type { Mention } from "@/components/app/mention-input";

/**
 * Pole opisu posta (deep module) — wspólny wrapper dla kompozytora tworzenia
 * i edycji. Reviza #187: formatowanie (WYSIWYG) jest ZAWSZE włączone — bez
 * switcha, na każdym urządzeniu (mobile/PWA też), z obsługą @mentions
 * (źródło prawdy: string value).
 *
 * Edytor ładowany leniwie (osobny chunk z CSS), ale podpięty od razu —
 * użytkownik pisze w WYSIWYG od pierwszego znaku.
 *
 * Mały interface (value / onChange / onMentionsChange) ukrywa konfigurację
 * MDXEditora i mechanizm podpowiedzi mencji.
 */
const WysiwygEditor = lazy(() => import("./wysiwyg-editor"));

interface PostDescriptionFieldProps {
	value: string;
	onChange: (value: string) => void;
	onMentionsChange?: (mentions: Mention[]) => void;
	placeholder?: string;
}

export function PostDescriptionField({
	value,
	onChange,
	onMentionsChange,
	placeholder,
}: PostDescriptionFieldProps) {
	return (
		<div className="space-y-2">
			<Suspense
				fallback={
					<div className="min-h-36 rounded-md border border-input bg-background p-3 text-sm text-muted-foreground">
						Ładowanie edytora…
					</div>
				}
			>
				<WysiwygEditor
					value={value}
					onChange={onChange}
					onMentionsChange={onMentionsChange}
					placeholder={placeholder}
				/>
			</Suspense>
		</div>
	);
}
