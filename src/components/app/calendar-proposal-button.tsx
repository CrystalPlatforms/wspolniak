// SPDX-License-Identifier: AGPL-3.0-or-later
import { ChevronDown, FileText, MailQuestion, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CalendarProposalButtonProps {
	/** [Jako post] — dotychczasowe zachowanie: formularz posta z szablonem. */
	onProposeAsPost: () => void;
	/** [Na czat] — czat z szablonem w composerze (draft z URL, F6 #219). */
	onProposeToChat: () => void;
}

/**
 * Przycisk „Zaproponuj datę" (F6 #219): dropdown z dwoma celami — [Jako post]
 * zachowuje stare zachowanie (kalendarz → formularz posta), [Na czat] prowadzi
 * do czatu z szablonem wstawionym do composerza (mechanizm draftu z F5 #218).
 */
export function CalendarProposalButton({
	onProposeAsPost,
	onProposeToChat,
}: CalendarProposalButtonProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="lg" title="Zaproponuj datę">
					<MailQuestion className="h-4 w-4" />
					<span className="hidden sm:inline">Zaproponuj datę</span>
					<ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={onProposeAsPost}>
					<FileText aria-hidden="true" />
					Jako post
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onProposeToChat}>
					<MessageSquare aria-hidden="true" />
					Na czat
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
