// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "install-banner-dismissed";

interface InstallBannerProps {
	canInstall: boolean;
	promptInstall: () => void;
}

export function InstallBanner({ canInstall, promptInstall }: InstallBannerProps) {
	const [dismissed, setDismissed] = useState(
		() => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true",
	);

	if (!canInstall || dismissed) return null;

	function handleDismiss() {
		localStorage.setItem(STORAGE_KEY, "true");
		setDismissed(true);
	}

	function handleInstall() {
		promptInstall();
		handleDismiss();
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) handleDismiss();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Zainstaluj aplikację Wspólniak</DialogTitle>
					<DialogDescription>
						Dodaj Wspólniak do ekranu głównego, aby mieć szybki dostęp do zdjęć rodzinnych.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">Jeśli masz pytania, podejdź do Adama.</p>
				<DialogFooter>
					<Button variant="outline" onClick={handleDismiss}>
						Nie teraz
					</Button>
					<Button onClick={handleInstall}>
						<IconDownload className="mr-1 h-4 w-4" aria-hidden="true" />
						Instaluj
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
