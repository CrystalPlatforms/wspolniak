// SPDX-License-Identifier: AGPL-3.0-or-later
import { DurableObject } from "cloudflare:workers";

/**
 * Durable Object pokoju czatu (F2 #153) — jedna instancja (`idFromName("global")`),
 * bo jedna rodzina = jeden pokój. WebSocket **Hibernation API** (free plan OK):
 * sockety tagowane userId (attachment {userId} pod connected set z F7).
 *
 * DO nie pisze wiadomości — wysyłka idzie przez HTTP POST (Hono), a Worker po
 * zapisie do DB woła `broadcastMessage`. DO trzyma też licznik anty-spamowy
 * (10 wiadomości/min, check-and-increment PRZED zapisem).
 */
export class ChatRoom extends DurableObject<Env> {
	/** Rozsyła wiadomość do wszystkich podłączonych socketów. Dedupe po id robi klient. */
	async broadcastMessage(message: unknown): Promise<void> {
		const payload = JSON.stringify({ type: "message", data: message });
		for (const socket of this.ctx.getWebSockets()) {
			socket.send(payload);
		}
	}

	/**
	 * Anty-spam: 10 wiadomości na minutę per user (check-and-increment PRZED zapisem
	 * do DB). Stałe okno 60s liczone od pierwszej wiadomości; increment-then-check —
	 * 11. wywołanie w oknie zwraca false i nie resetuje okna.
	 */
	async checkAndIncrementRateLimit(userId: string): Promise<boolean> {
		const key = `rl:${userId}`;
		const now = Date.now();
		const entry = (await this.ctx.storage.get<{ count: number; windowStart: number }>(key)) ?? {
			count: 0,
			windowStart: now,
		};

		let { count, windowStart } = entry;
		if (now - windowStart >= 60_000) {
			count = 0;
			windowStart = now;
		}
		count += 1;
		await this.ctx.storage.put(key, { count, windowStart });
		return count <= CHAT_RATE_LIMIT_PER_MINUTE;
	}

	/** Id podłączonych userów (hibernacyjne attachmenty) — F7 suppressuje push dla nich. */
	async getConnectedUserIds(): Promise<string[]> {
		const ids = new Set<string>();
		for (const socket of this.ctx.getWebSockets()) {
			try {
				const attachment = socket.deserializeAttachment() as { userId?: string } | undefined;
				if (attachment?.userId) ids.add(attachment.userId);
			} catch {
				// Socket bez attachmentu (np. starszy protokół) — ignorujemy.
			}
		}
		return [...ids];
	}

	/**
	 * Upgrade WebSocketu. Worker (Hono, po weryfikacji sesji) przekazuje zaufany
	 * nagłówek `x-chat-user-id` — sam DO nie weryfikuje tożsamości (nie jest eksponowany).
	 */
	async fetch(request: Request): Promise<Response> {
		const userId = request.headers.get("x-chat-user-id");
		if (!userId) {
			return new Response("Missing user", { status: 400 });
		}

		const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
		server.serializeAttachment({ userId });
		this.ctx.acceptWebSocket(server, [userId]);
		return new Response(null, { status: 101, webSocket: client });
	}
}

/** Limit wiadomości na minutę na użytkownika (PRD czatu: anty-spam 10/min). */
export const CHAT_RATE_LIMIT_PER_MINUTE = 10;
