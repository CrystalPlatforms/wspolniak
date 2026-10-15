// SPDX-License-Identifier: AGPL-3.0-or-later
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Ikona „Wspomnij na czacie" (F5 #218) w rogu cudzych postów — dokładnie tam,
 * gdzie we własnym poście stoi menu „...". Otwiera czat z draftem posta.
 */
export function ShareToChatButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className="size-12 sm:size-16"
			title="Wspomnij na czacie"
			aria-label="Wspomnij na czacie"
			onClick={onClick}
		>
			<MessagesSquare className="size-6 sm:size-8" />
		</Button>
	);
}
