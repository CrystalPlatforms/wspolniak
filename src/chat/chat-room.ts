// SPDX-License-Identifier: AGPL-3.0-or-later
import { DurableObject } from "cloudflare:workers";

/**
 * Durable Object pokoju czatu (F2 #153) — jedna instancja (`idFromName("global")`),
 * bo jedna rodzina = jeden pokój. WebSocket **Hibernation API** (free plan OK):
 * sockety tagowane userId (attachment {userId} pod connected set z F7).
 *
 * DO nie pisze wiadomości — wysyłka idzie przez HTTP POST (Hono), a Worker po
 * zapisie do DB woła `broadcastMessage`. DO rozsyła też anonimowe eventy typing
 * (F3 #154) i trzyma licznik anty-spamowy (10 wiadomości/min, check-and-increment
 * PRZED zapisem).
 */
export class ChatRoom extends DurableObject<Env> {
	/**
	 * Rozsyła dowolny event ({type, data}) do wszystkich podłączonych socketów —
	 * F4 #155 (reakcje) potrzebowało typów innych niż "message". Dedupe robi klient.
	 */
	async broadcastEvent(type: string, data: unknown): Promise<void> {
		const payload = JSON.stringify({ type, data });
		for (const socket of this.ctx.getWebSockets()) {
			socket.send(payload);
		}
	}

	/** Wiadomość = event typu "message". Dedupe po id robi klient. */
	async broadcastMessage(message: unknown): Promise<void> {
		await this.broadcastEvent("message", message);
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

	/**
	 * Throttle pusha czatu (F7 #158): jeden push na usera na 2 minuty —
	 * check-and-set w storage DO (klucz `pt:{userId}`). Pierwszy push w oknie
	 * zwraca true i zapisuje znacznik; kolejny w oknie → false BEZ nadpisywania
	 * (okno nie startuje od nowa); po upływie okna → znowu true.
	 */
	async checkAndIncrementPushThrottle(userId: string): Promise<boolean> {
		const key = `pt:${userId}`;
		const now = Date.now();
		const lastPushAt = (await this.ctx.storage.get<number>(key)) ?? 0;
		if (now - lastPushAt < CHAT_PUSH_THROTTLE_MS) return false;
		await this.ctx.storage.put(key, now);
		return true;
	}

	/**
	 * Typing indicator (F3 #154): klient przesyła `{type:"typing"}` przez WS, DO
	 * rozsyla anonimowy event pozostałym userom. Wykluczenie per userId (attachment),
	 * nie per socket — druga karta piszącego też nie widzi własnego typingu.
	 * Wszystko poza poprawnym typingem jest ignorowane (socket żyje dalej).
	 */
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(message);
		} catch {
			return;
		}
		if ((parsed as { type?: string } | null)?.type !== "typing") return;

		const senderUserId = attachmentUserId(ws);
		const payload = JSON.stringify({ type: "typing" });
		for (const socket of this.ctx.getWebSockets()) {
			if (attachmentUserId(socket) === senderUserId) continue;
			socket.send(payload);
		}
	}

	/** Id podłączonych userów (hibernacyjne attachmenty) — F7 suppressuje push dla nich. */
	async getConnectedUserIds(): Promise<string[]> {
		const ids = new Set<string>();
		for (const socket of this.ctx.getWebSockets()) {
			const userId = attachmentUserId(socket);
			if (userId) ids.add(userId);
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

/** userId z hibernacyjnego attachmentu socketa; undefined dla starszych protokołów. */
function attachmentUserId(socket: WebSocket): string | undefined {
	try {
		const attachment = socket.deserializeAttachment() as { userId?: string } | undefined;
		return attachment?.userId;
	} catch {
		return undefined;
	}
}

/** Limit wiadomości na minutę na użytkownika (PRD czatu: anty-spam 10/min). */
export const CHAT_RATE_LIMIT_PER_MINUTE = 10;

/** Okno throttla pusha czatu per user (PRD czatu: jeden push na 2 minuty). */
export const CHAT_PUSH_THROTTLE_MS = 120_000;
