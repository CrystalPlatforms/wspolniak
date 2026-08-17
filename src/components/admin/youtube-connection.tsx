// SPDX-License-Identifier: AGPL-3.0-or-later

import { Youtube } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";

export interface YoutubeConnectionStatus {
	connected: boolean;
	channelTitle: string | null;
}

interface YoutubeConnectionProps {
	/** Current connection status; undefined while loading. */
	connection: YoutubeConnectionStatus | undefined;
	isDisconnecting: boolean;
	onDisconnect: () => void;
	/** One-shot feedback from the OAuth redirect (?youtube=…). */
	flash?: "connected" | "error" | null;
}

export function YoutubeConnection({
	connection,
	isDisconnecting,
	onDisconnect,
	flash,
}: YoutubeConnectionProps) {
	const connected = connection?.connected === true;

	return (
		<section className="rounded-lg border border-border bg-card p-4">
			<div className="mb-2 flex items-center gap-2">
				<Youtube className="h-4 w-4 text-foreground" />
				<h2 className="text-sm font-medium text-foreground">YouTube</h2>
			</div>

			{flash === "connected" && (
				<Alert variant="default" className="mb-2">
					Połączono z YouTube.
				</Alert>
			)}
			{flash === "error" && (
				<Alert variant="destructive" className="mb-2">
					Nie udało się połączyć z YouTube.
				</Alert>
			)}

			{connected ? (
				<div className="flex items-center justify-between gap-2">
					<p className="text-sm text-foreground">
						Połączono z <strong>{connection?.channelTitle}</strong>
					</p>
					<Button
						size="sm"
						variant="outline"
						onClick={onDisconnect}
						disabled={isDisconnecting}
						aria-label="Rozłącz"
					>
						{isDisconnecting ? (
							<>
								<Loader loading={isDisconnecting} />
								<span>Rozłączam…</span>
							</>
						) : (
							<span>Rozłącz</span>
						)}
					</Button>
				</div>
			) : (
				<div className="flex items-center justify-between gap-2">
					<p className="text-sm text-muted-foreground">
						Brak połączenia — filmy wymagają kanału YouTube.
					</p>
					<Button size="sm" asChild>
						<a href="/api/video/oauth/start">Połącz YouTube</a>
					</Button>
				</div>
			)}
		</section>
	);
}
