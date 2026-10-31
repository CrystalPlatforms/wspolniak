// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MaintenanceConfig, MaintenanceUpdate } from "@/db/instance/queries";

export interface MaintenanceSectionProps {
	config: MaintenanceConfig;
	isSaving: boolean;
	errorMessage?: string;
	onSave: (input: MaintenanceUpdate) => void;
}

export function MaintenanceSection({
	config,
	isSaving,
	errorMessage,
	onSave,
}: MaintenanceSectionProps) {
	const [enabled, setEnabled] = useState(config.enabled);
	const [message, setMessage] = useState(config.message);
	const [subtitle, setSubtitle] = useState(config.subtitle);
	const [icon, setIcon] = useState(config.icon);

	function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		onSave({ enabled, message, subtitle, icon });
	}

	return (
		<>
			<div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
				<Label htmlFor="maintenance-enabled" className="text-sm font-medium text-foreground">
					{enabled ? "Włączony" : "Wyłączony"}
				</Label>
				<Switch
					id="maintenance-enabled"
					checked={enabled}
					onCheckedChange={setEnabled}
					aria-label="Tryb awaryjny"
				/>
			</div>

			{errorMessage && (
				<Alert variant="destructive" className="mb-3">
					{errorMessage}
				</Alert>
			)}

			<form onSubmit={handleSubmit} className="space-y-3">
				<div className="space-y-1">
					<Label htmlFor="maintenance-message">Napis</Label>
					<Input
						id="maintenance-message"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						maxLength={200}
						placeholder="Wspólniak jest w trakcie naprawy"
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="maintenance-subtitle">Podtytuł</Label>
					<Input
						id="maintenance-subtitle"
						value={subtitle}
						onChange={(e) => setSubtitle(e.target.value)}
						maxLength={100}
						placeholder="Wróć za chwilę"
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="maintenance-icon">Ikona</Label>
					<Input
						id="maintenance-icon"
						value={icon}
						onChange={(e) => setIcon(e.target.value)}
						maxLength={50}
						placeholder="alert-triangle"
					/>
					<p className="text-xs text-muted-foreground">
						Nazwa ikony z biblioteki Tabler, np. <code>alert-triangle</code>, <code>wrench</code>,{" "}
						<code>hammer</code>. Nieznana nazwa → ikona ostrzeżenia.
					</p>
				</div>
				<Button type="submit" disabled={isSaving}>
					{isSaving ? "Zapisuję..." : "Zapisz"}
				</Button>
			</form>
		</>
	);
}
