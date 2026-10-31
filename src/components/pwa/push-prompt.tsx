// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconBell } from "@tabler/icons-react";
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
import { usePushSubscription } from "@/pwa/use-push-subscription";

const STORAGE_KEY = "push-prompt-dismissed";

interface PushPromptProps {
	isStandalone: boolean;
}

export function PushPrompt({ isStandalone }: PushPromptProps) {
	const { permission, isSubscribed, subscribe } = usePushSubscription();
	const [dismissed, setDismissed] = useState(
		() => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true",
	);

	if (!isStandalone) return null;
	if (permission === "unsupported" || permission === "denied") return null;
	if (isSubscribed) return null;
	if (dismissed) return null;

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
					<DialogTitle>Włącz powiadomienia</DialogTitle>
					<DialogDescription>
						Otrzymuj powiadomienia o nowych zdjęciach od rodziny.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">Jeśli masz pytania, podejdź do Adama.</p>
				<DialogFooter>
					<Button variant="outline" onClick={handleDismiss}>
						Nie teraz
					</Button>
					<Button onClick={subscribe}>
						<IconBell className="mr-1 h-4 w-4" aria-hidden="true" />
						Włącz
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
