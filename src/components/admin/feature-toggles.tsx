// SPDX-License-Identifier: AGPL-3.0-or-later

import { LoaderIcon } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { FeatureFlags } from "@/db/instance";

interface FeatureTogglesProps {
	flags?: FeatureFlags;
	isSaving: boolean;
	onChange: (input: { video?: boolean; markdown?: boolean; library?: boolean }) => void;
}

/**
 * Sekcja „Funkcje" w panelu admina — master switch dla Wideo, Edytora i Biblioteki.
 * Stan jest trzymany w `instance_config`; zmiana natychmiast wysyła PUT.
 */
export function FeatureToggles({ flags, isSaving, onChange }: FeatureTogglesProps) {
	const video = flags?.video ?? true;
	const markdown = flags?.markdown ?? true;
	const library = flags?.library ?? true;

	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<div className="mb-3 flex items-center gap-2">
				<h2 className="text-lg font-semibold text-foreground">Funkcje</h2>
				{isSaving ? <LoaderIcon loading={isSaving} /> : null}
			</div>
			<div className="space-y-3">
				<ToggleRow
					label="Wideo"
					description="Kanał Wspólniak Wideo i przycisk dodawania filmów."
					checked={video}
					disabled={isSaving}
					onCheckedChange={(v) => onChange({ video: v })}
				/>
				<ToggleRow
					label="Edytor (Markdown)"
					description="Pasek formatowania i podgląd Markdown w kompozytorze postów."
					checked={markdown}
					disabled={isSaving}
					onCheckedChange={(v) => onChange({ markdown: v })}
				/>
				<ToggleRow
					label="Biblioteka"
					description="Zapisywanie postów do Biblioteki i strona /lib."
					checked={library}
					disabled={isSaving}
					onCheckedChange={(v) => onChange({ library: v })}
				/>
			</div>
		</div>
	);
}

interface ToggleRowProps {
	label: string;
	description: string;
	checked: boolean;
	disabled: boolean;
	onCheckedChange: (value: boolean) => void;
}

function ToggleRow({ label, description, checked, disabled, onCheckedChange }: ToggleRowProps) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="flex flex-col">
				<span className="font-medium text-foreground">{label}</span>
				<span className="text-xs text-muted-foreground">{description}</span>
			</span>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
				aria-label={label}
			/>
		</div>
	);
}
