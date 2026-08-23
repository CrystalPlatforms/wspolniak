// SPDX-License-Identifier: AGPL-3.0-or-later
import { Copy, CornerUpLeft, Info, Trash2, Users } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	ChatReactionBar,
	ChatWhoReactedDialog,
	useChatReactions,
} from "@/components/chat/chat-reactions";
import type { ChatMessageItem } from "@/components/chat/chat-view";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

/** Punkt otwarcia menu we współrzędnych viewportu (pointer / klawiatura). */
export interface ChatBubbleMenuPosition {
	x: number;
	y: number;
}

export interface ChatBubbleMenuProps {
	message: ChatMessageItem;
	position: ChatBubbleMenuPosition;
	currentUserId: string;
	currentUserName: string;
	/** Admin widzi „Usuń" też na cudzych wiadomościach (F6 #157). */
	isAdmin: boolean;
	onReply: (message: ChatMessageItem) => void;
	onDelete: (messageId: string) => void;
	onClose: () => void;
}

/** Szacowana szerokość menu (w-52 = 13rem) + wysokość z abdomenu pozycji. */
const MENU_WIDTH = 208;
const MENU_MAX_HEIGHT = 340;

/** Pełna data i godzina wysłania (F5 #156, user story 8) — format PL. */
export function formatChatFullDateTime(iso: string): string {
	return new Date(iso).toLocaleString("pl-PL", { dateStyle: "full", timeStyle: "short" });
}

/** Klampuje pozycję menu do viewportu (nie wystaje poza prawy/dolny brzeg). */
function clampPosition(position: ChatBubbleMenuPosition): ChatBubbleMenuPosition {
	const margin = 8;
	return {
		x: Math.max(margin, Math.min(position.x, window.innerWidth - MENU_WIDTH - margin)),
		y: Math.max(margin, Math.min(position.y, window.innerHeight - MENU_MAX_HEIGHT - margin)),
	};
}

/**
 * Context menu bąbelka (F5 #156 + życzenia usera: reakcje i „kto zareagował"
 * też w menu; reakcje duże, na całą szerokość; pasek pod bąbelkiem usunięty).
 * Otwiera je ChatView po long-press / prawym kliku / Enter. Zamykanie: Escape
 * lub pointer poza menu — ALE itemy otwierające dialog (Info, Kto zareagował)
 * chowają menu i zamykają całość dopiero, gdy dialog się zamknie (komponent
 * musi pozostać zamontowany, dopóki żyje dialog — inaczej ChatView go odmontuje).
 * F6 #157: „Usuń" tylko dla autora/admina.
 */
export function ChatBubbleMenu({
	message,
	position,
	currentUserId,
	currentUserName,
	isAdmin,
	onReply,
	onDelete,
	onClose,
}: ChatBubbleMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [whoOpen, setWhoOpen] = useState(false);
	const [infoOpen, setInfoOpen] = useState(false);
	const reactions = useChatReactions(message.id);
	const canDelete = message.authorId === currentUserId || isAdmin;
	const dialogOpen = whoOpen || infoOpen;

	useEffect(() => {
		// Zamknięcie: pointerdown poza menu (klik w menu nie zamyka — np. kilka
		// reakcji pod rząd) oraz Escape. Gdy otwarty jest NASZ dialog (lub dialog
		// paska reakcji), steruje on sam — klik w dialog nie zjada menu+dialogu.
		function handlePointerDown(event: PointerEvent) {
			if (dialogOpen) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest?.('[role="dialog"]')) return;
			if (menuRef.current?.contains(event.target as Node)) return;
			onClose();
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			if (dialogOpen) return; // Radix zamyka dialog sam; po zamknięciu → onClose
			onClose();
		}
		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose, dialogOpen]);

	const clamped = clampPosition(position);

	/** Dialog zamknięty → sprzątamy też menu (ukryte od otwarcia dialogu). */
	function dialogClosed(setOpen: (open: boolean) => void, open: boolean) {
		setOpen(open);
		if (!open) onClose();
	}

	function item(
		label: string,
		icon: ReactNode,
		onActivate: () => void,
		extraClass = "",
		keepMenu = false,
	): ReactNode {
		return (
			<button
				key={label}
				type="button"
				role="menuitem"
				onClick={() => {
					onActivate();
					// Itemy otwierające dialog NIE zamykają menu od razu — menu znika
					// wizualnie (dialogOpen), komponent żyje do końca życia dialogu.
					if (!keepMenu) onClose();
				}}
				className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${extraClass}`}
			>
				{icon}
				{label}
			</button>
		);
	}

	return (
		<>
			{!dialogOpen ? (
				<div
					ref={menuRef}
					role="menu"
					aria-label="Menu wiadomości"
					data-chat-bubble-menu
					style={{ left: clamped.x, top: clamped.y }}
					className="chat-menu-in fixed z-50 w-52 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
				>
					{/* Reakcje wprost w menu (życzenie usera HITL): duże ikony (24px)
					    rozciągnięte na całą szerokość menu — variant="menu" paska. */}
					<div className="border-b border-border">
						<ChatReactionBar
							messageId={message.id}
							currentUserId={currentUserId}
							currentUserName={currentUserName}
							variant="menu"
						/>
					</div>
					<div className="flex flex-col py-1">
						{item("Odpowiedz", <CornerUpLeft className="size-4" />, () => onReply(message))}
						{item("Kopiuj", <Copy className="size-4" />, () => {
							void navigator.clipboard?.writeText(message.text);
						})}
						{item("Kto zareagował", <Users className="size-4" />, () => setWhoOpen(true), "", true)}
						{item("Info", <Info className="size-4" />, () => setInfoOpen(true), "", true)}
						{canDelete
							? item(
									"Usuń",
									<Trash2 className="size-4" />,
									() => onDelete(message.id),
									"text-destructive",
								)
							: null}
					</div>
				</div>
			) : null}
			<ChatWhoReactedDialog
				open={whoOpen}
				onOpenChange={(open) => dialogClosed(setWhoOpen, open)}
				reactions={reactions}
				type={null}
			/>
			<Dialog open={infoOpen} onOpenChange={(open) => dialogClosed(setInfoOpen, open)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-center">Informacje</DialogTitle>
						<DialogDescription className="sr-only">
							Autor i pełna data wysłania wiadomości
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2 text-sm">
						<p className="text-foreground">
							<span className="font-medium">Autor:</span> {message.author.name}
						</p>
						<p className="text-foreground">
							<span className="font-medium">Wysłano:</span>{" "}
							{formatChatFullDateTime(message.createdAt)}
						</p>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
