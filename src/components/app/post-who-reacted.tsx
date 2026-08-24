// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";
import { Smile } from "lucide-react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ReactionTarget, ReactionWithUser } from "@/db/post-reactions/queries";
import { AppleEmoji } from "./apple-emoji";
import { REACTION_ORDER, targetKey, targetUrls } from "./reaction-config";

interface PostWhoReactedProps {
	target: ReactionTarget;
}

async function fetchReactionUsers(url: string): Promise<ReactionWithUser[]> {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Failed to fetch reaction users");
	const json = (await res.json()) as { data: ReactionWithUser[] };
	return json.data;
}

/**
 * Przycisk „Kto zareagował" w nagłówku posta (rewizja HITL #161): obok
 * „Dodaj do Biblioteki", w wymiarach przycisku PostActions (3 kropki).
 * Klik otwiera dialog wszystkich reakcji pogrupowanych per typ (emoji + imiona);
 * lista pobierana dopiero przy otwarciu.
 */
export function PostWhoReacted({ target }: PostWhoReactedProps) {
	const [open, setOpen] = useState(false);
	const usersKey = [...targetKey(target), "users"] as const;
	const { data: reactions = [] } = useQuery({
		queryKey: usersKey,
		queryFn: () => fetchReactionUsers(targetUrls(target).users),
		enabled: open,
	});

	// Sekcje w stałej kolejności konfigu; tylko niepuste typy.
	const sections = REACTION_ORDER.map((type) => ({
		type,
		people: reactions.filter((reaction) => reaction.reactionType === type),
	})).filter((section) => section.people.length > 0);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Kto zareagował"
				title="Kto zareagował"
				className="grid size-12 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:size-16"
			>
				<Smile className="size-6 sm:size-8" />
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="text-center">Kto zareagował</DialogTitle>
						<DialogDescription className="sr-only">
							Lista użytkowników którzy zareagowali
						</DialogDescription>
					</DialogHeader>
					<div>
						{sections.length === 0 ? (
							<p className="text-center text-muted-foreground">Brak reakcji</p>
						) : (
							<div className="space-y-3">
								{sections.map((section) => (
									<div
										key={section.type}
										className="flex flex-wrap items-center justify-center gap-2"
									>
										<AppleEmoji name={section.type} size={20} />
										{section.people.map((reaction) => (
											<span
												key={reaction.id}
												className="rounded-md bg-muted px-2 py-1 text-sm text-foreground"
											>
												{reaction.user?.name ?? "Nieznany"}
											</span>
										))}
									</div>
								))}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
