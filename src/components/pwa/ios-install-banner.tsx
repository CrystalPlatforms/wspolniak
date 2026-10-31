// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconPlus, IconShare } from "@tabler/icons-react";
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

const STORAGE_KEY = "ios-install-banner-dismissed";

interface IOSInstallBannerProps {
	isIOSSafari: boolean;
	isStandalone: boolean;
}

export function IOSInstallBanner({ isIOSSafari, isStandalone }: IOSInstallBannerProps) {
	const [dismissed, setDismissed] = useState(
		() => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true",
	);

	if (!isIOSSafari || isStandalone || dismissed) return null;

	function handleDismiss() {
		localStorage.setItem(STORAGE_KEY, "true");
		setDismissed(true);
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
					<DialogTitle>Dodaj do ekranu głównego</DialogTitle>
					<DialogDescription>
						Aby zainstalować aplikację, naciśnij ikonę{" "}
						<IconShare className="inline-block h-4 w-4" aria-hidden="true" /> Udostępnij, a
						następnie wybierz <IconPlus className="inline-block h-4 w-4" aria-hidden="true" /> Dodaj
						do ekranu głównego.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">Jeśli masz pytania, podejdź do Adama.</p>
				<DialogFooter>
					<Button onClick={handleDismiss}>OK, rozumiem</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
