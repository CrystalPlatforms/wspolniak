// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense } from "react";
import { GradientAiButton } from "@/components/app/ai/gradient-ai-button";
import type { Mention } from "@/components/app/mention-input";

/**
 * Pole opisu posta (deep module) — wspólny wrapper dla kompozytora tworzenia
 * i edycji. Reviza #187: formatowanie (WYSIWYG) jest ZAWSZE włączone — bez
 * switcha, na każdym urządzeniu (mobile/PWA też), z obsługą @mentions i
 * przycisków AL na tym samym markdownie (źródło prawdy: string value).
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
	/**
	 * Pierwsze przypięte zdjęcie (kompozytor tworzenia) — włącza wariant
	 * „Zaproponuj opis", gdy pole jest puste (F3 #190). Edit-form nie podaje.
	 */
	proposeFile?: File | null;
	/**
	 * Reviza #187: pary przycisków AL nie renderujemy w polu, gdy rodzic
	 * pokazuje je w innym miejscu (kompozytor tworzenia — rząd nagłówka).
	 */
	showAiButtons?: boolean;
}

export function PostDescriptionField({
	value,
	onChange,
	onMentionsChange,
	placeholder,
	proposeFile,
	showAiButtons = true,
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

			{/* AL (F2/F3 #189/#190): para przycisków — „Popraw opis" aktywny przy
			    treści, „Zaproponuj opis" przy pustym polu i zdjęciu (proposeFile;
			    edit-form go nie podaje → samo improve). Sukces podmienia treść
			    pola (sync przez value → setMarkdown w edytorze). Reviza #187:
			    kompozytor tworzenia wyłącza parę tutaj i renderuje ją przy nagłówku. */}
			{showAiButtons && (
				<GradientAiButton
					target="post-description"
					text={value}
					file={proposeFile}
					onResult={onChange}
				/>
			)}
		</div>
	);
}
