// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import {
	MAINTENANCE_ICONS,
	resolveMaintenanceIcon,
} from "@/components/maintenance/maintenance-icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MaintenanceConfig, MaintenanceUpdate } from "@/db/instance/queries";
import { cn } from "@/lib/utils";

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
				{/* Ikona: wybór z rejestru (reviza usera — wpisywanie nazwy z Tablera
				    nie działało, bo overlay zna tylko skuratowany zestaw). Prawdziwe
				    radio-inputy (sr-only) + ikona jako etykieta — dostępne bez ról ARIA. */}
				<fieldset className="space-y-1 border-0 p-0">
					<legend className="text-sm font-medium text-foreground">Ikona</legend>
					<div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
						{MAINTENANCE_ICONS.map((choice) => {
							const selected = choice.key === icon.toLowerCase();
							return (
								<label
									key={choice.key}
									title={choice.label}
									className={cn(
										"relative flex h-14 cursor-pointer items-center justify-center rounded-md border transition-colors",
										selected
											? "border-primary bg-accent text-accent-foreground"
											: "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
									)}
								>
									<input
										type="radio"
										name="maintenance-icon"
										value={choice.key}
										checked={selected}
										onChange={() => setIcon(choice.key)}
										className="sr-only"
										aria-label={choice.label}
									/>
									<choice.Icon className="size-6" aria-hidden="true" />
								</label>
							);
						})}
					</div>
					<p className="text-xs text-muted-foreground">
						Wybrana: {resolveMaintenanceIcon(icon).label}
					</p>
				</fieldset>
				<Button type="submit" disabled={isSaving}>
					{isSaving ? "Zapisuję..." : "Zapisz"}
				</Button>
			</form>
		</>
	);
}
