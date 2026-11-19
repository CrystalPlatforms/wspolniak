// SPDX-License-Identifier: AGPL-3.0-or-later

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MaintenanceConfig, MaintenanceUpdate } from "@/db/instance/queries";
import { MaintenanceSection } from "./maintenance-section";

export interface MaintenanceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	config: MaintenanceConfig;
	isSaving: boolean;
	errorMessage?: string;
	onSave: (input: MaintenanceUpdate) => void;
}

export function MaintenanceDialog({
	open,
	onOpenChange,
	config,
	isSaving,
	errorMessage,
	onSave,
}: MaintenanceDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Tryb awaryjny</DialogTitle>
				</DialogHeader>
				<MaintenanceSection
					config={config}
					isSaving={isSaving}
					errorMessage={errorMessage}
					onSave={onSave}
				/>
			</DialogContent>
		</Dialog>
	);
}
