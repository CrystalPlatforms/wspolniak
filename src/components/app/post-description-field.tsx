// SPDX-License-Identifier: AGPL-3.0-or-later
import { Eye, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { FormattingToolbar } from "@/components/app/formatting-toolbar";
import { MarkdownText } from "@/components/app/markdown-text";
import { type Mention, MentionInput } from "@/components/app/mention-input";
import { Button } from "@/components/ui/button";

/**
 * Pole opisu posta (deep module) — wspólny wrapper dla kompozytora tworzenia
 * i edycji. Łączy post-only toolbar formatowania, mention-aware textarea oraz
 * przełącznik „Podgląd" / „Edytuj" z renderowanym podglądem Markdown.
 *
 * Mały interface (value / onChange / onMentionsChange) ukrywa współdzielony
 * `descriptionRef` (toolbar ↔ textarea) oraz stan trybu podglądu. Komentarze
 * nadal używają gołego `MentionInput` — formatowanie zostaje post-only.
 */
interface PostDescriptionFieldProps {
	value: string;
	onChange: (value: string) => void;
	onMentionsChange?: (mentions: Mention[]) => void;
	id?: string;
	placeholder?: string;
}

export function PostDescriptionField({
	value,
	onChange,
	onMentionsChange,
	id = "description",
	placeholder,
}: PostDescriptionFieldProps) {
	const descriptionRef = useRef<HTMLTextAreaElement>(null);
	const [showPreview, setShowPreview] = useState(false);

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-1">
				{/* Toolbar ma sens tylko podczas edycji — w podglądzie go chowamy. */}
				{!showPreview && (
					<FormattingToolbar textareaRef={descriptionRef} value={value} onChange={onChange} />
				)}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setShowPreview((prev) => !prev)}
				>
					{showPreview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
					{showPreview ? "Edytuj" : "Podgląd"}
				</Button>
			</div>
			{showPreview ? (
				<div className="min-h-36 rounded-md border border-input bg-background p-3 text-foreground">
					<MarkdownText text={value} className="break-words text-foreground" />
				</div>
			) : (
				<MentionInput
					textareaRef={descriptionRef}
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
