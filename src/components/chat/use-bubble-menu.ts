// SPDX-License-Identifier: AGPL-3.0-or-later
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageItem } from "@/components/chat/chat-view";

/** Otwarte menu bąbelka: id wiadomości + punkt otwarcia (viewport). */
export interface BubbleMenuState {
	messageId: string;
	x: number;
	y: number;
}

/** Czas przytrzymania otwierający context menu (F5 #156) — standard mobile. */
const LONG_PRESS_MS = 500;

/** Dryf palca kasujący long-press (scroll zamiast menu). */
const LONG_PRESS_SLOP_PX = 10;

/** Publiczny interfejs hooka — handlery wpiń w bąbelek (div[role=button]). */
export interface BubbleMenuApi {
	menu: BubbleMenuState | null;
	closeMenu: () => void;
	handlePointerDown: (message: ChatMessageItem, event: React.PointerEvent<HTMLDivElement>) => void;
	handlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
	cancelPress: () => void;
	handleContextMenu: (message: ChatMessageItem, event: React.MouseEvent<HTMLDivElement>) => void;
	handleKeyDown: (message: ChatMessageItem, event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Otwieranie context menu bąbelka (F5 #156): **long-press** (~500ms, mobile),
 * **prawy klik** (desktop) lub **Enter/Space** na fokuse'owanym bąbelku.
 * Zwykły tap nic nie robi (pointerup anuluje timer); dryf > slop px = scroll,
 * też anuluje. Menu renderuje ChatView (stan {messageId, x, y}).
 */
export function useBubbleMenu(): BubbleMenuApi {
	const [menu, setMenu] = useState<BubbleMenuState | null>(null);
	const pressTimerRef = useRef<number | undefined>(undefined);
	const pressStartRef = useRef<{ x: number; y: number } | null>(null);

	// Zwolnij timer przy odmontowaniu — menu nie otwiera się „po czasie".
	useEffect(() => () => window.clearTimeout(pressTimerRef.current), []);

	const closeMenu = useCallback(() => setMenu(null), []);

	const cancelPress = useCallback(() => {
		window.clearTimeout(pressTimerRef.current);
		pressStartRef.current = null;
	}, []);

	function open(message: ChatMessageItem, x: number, y: number) {
		setMenu({ messageId: message.id, x, y });
	}

	function handlePointerDown(message: ChatMessageItem, event: React.PointerEvent<HTMLDivElement>) {
		pressStartRef.current = { x: event.clientX, y: event.clientY };
		const { clientX, clientY } = event;
		pressTimerRef.current = window.setTimeout(() => {
			pressStartRef.current = null;
			open(message, clientX, clientY);
		}, LONG_PRESS_MS);
	}

	function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
		const start = pressStartRef.current;
		if (!start) return;
		if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP_PX) {
			cancelPress();
		}
	}

	function handleContextMenu(message: ChatMessageItem, event: React.MouseEvent<HTMLDivElement>) {
		event.preventDefault();
		open(message, event.clientX, event.clientY);
	}

	function handleKeyDown(message: ChatMessageItem, event: React.KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		const rect = event.currentTarget.getBoundingClientRect();
		open(message, rect.left, rect.top);
	}

	return {
		menu,
		closeMenu,
		handlePointerDown,
		handlePointerMove,
		cancelPress,
		handleContextMenu,
		handleKeyDown,
	};
}
