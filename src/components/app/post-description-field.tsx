// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useState } from "react";
import { type Mention, MentionInput } from "@/components/app/mention-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSupportsRichText } from "@/hooks/use-supports-rich-text";

/**
 * Pole opisu posta (deep module) — wspólny wrapper dla kompozytora tworzenia
 * i edycji. Domyślnie zwykłe pole tekstowe (bez formatowania). Włączenie switcha
 * „Formatowanie" doładuje leniwie edytor WYSIWYG (osobny chunk — strona bez
 * włączonego formatowania nie pobiera biblioteki edytora).
 *
 * Formatowanie jest dostępne TYLKO na desktopie w przeglądarce — na mobile i
 * w PWA (zainstalowana aplikacja) switch w ogóle się nie pojawia (zob.
 * {@link useSupportsRichText}), bo WYSIWYG jest ciężki i nieporęczny na telefonie.
 *
 * Mały interface (value / onChange / onMentionsChange) ukrywa stan switcha i
 * granicę Suspense. Komentarze używają gołego `MentionInput` (zwykły tekst).
 */
const WysiwygEditor = lazy(() => import("./wysiwyg-editor"));

interface PostDescriptionFieldProps {
	value: string;
	onChange: (value: string) => void;
	onMentionsChange?: (mentions: Mention[]) => void;
	id?: string;
	placeholder?: string;
	/** Gdy false, pole jest zwykłym tekstem (bez switcha i edytora). */
	markdownEnabled?: boolean;
}

export function PostDescriptionField({
	value,
	onChange,
	onMentionsChange,
	id = "description",
	placeholder,
	markdownEnabled = true,
}: PostDescriptionFieldProps) {
	const [richTextOn, setRichTextOn] = useState(false);
	// Formatowanie widać tylko gdy dozwolone (markdown) i wspierane (desktop).
	const supportsRichText = useSupportsRichText();
	const canFormat = markdownEnabled && supportsRichText;
	const showEditor = canFormat && richTextOn;

	return (
		<div className="space-y-2">
			{canFormat && (
				<div className="flex items-center gap-2">
					<Switch
						id="post-format-toggle"
						aria-labelledby="post-format-toggle-label"
						checked={richTextOn}
						onCheckedChange={setRichTextOn}
					/>
					<Label
						id="post-format-toggle-label"
						htmlFor="post-format-toggle"
						className="text-sm text-muted-foreground"
					>
						Formatowanie
					</Label>
				</div>
			)}

			{showEditor ? (
				<Suspense
					fallback={
						<div className="min-h-36 rounded-md border border-input bg-background p-3 text-sm text-muted-foreground">
							Ładowanie edytora…
						</div>
					}
				>
					<WysiwygEditor value={value} onChange={onChange} />
				</Suspense>
			) : (
				<MentionInput
					id={id}
					value={value}
					onChange={onChange}
					onMentionsChange={onMentionsChange}
					placeholder={placeholder ?? "Co się wydarzyło? (@aby kogoś oznaczyć)"}
					maxLength={2000}
					rows={6}
					className="min-h-36 resize-y"
				/>
			)}
		</div>
	);
}
