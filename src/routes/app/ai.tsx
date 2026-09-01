// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Download, Pause, RotateCcw, SendHorizontal } from "lucide-react";
import { useState } from "react";
import { AlLogo } from "@/components/app/ai/al-logo";
import { JellyOoze } from "@/components/app/ai/jelly-ooze";
import { BeamBorder } from "@/components/app/beam-border";
import { MarkdownText } from "@/components/app/markdown-text";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportConversation } from "@/core/ai/export-chat";
import type { UiChatMessage } from "@/core/ai/use-ai-chat";
import { useAiChat } from "@/core/ai/use-ai-chat";

// Czat z AL (F3 #181): pusty stan = animowane logo + „Cześć, tu AL" (bez bańki);
// odpowiedzi streamowane jako Markdown, myślenie modelu w zwijanej sekcji.
// Konwersacja trzyma się w localStorage (ostatnie 100 wiadomości) — „Nowa
// rozmowa" czyści ją; input na dole w beamie + eksport .md/.txt/PDF.
export const Route = createFileRoute("/app/ai")({
	component: AiScreen,
});

function AiScreen() {
	const { messages, send, stop, isStreaming, clearConversation } = useAiChat();
	const [input, setInput] = useState("");

	const submit = () => {
		if (!input.trim() || isStreaming) return;
		void send(input);
		setInput("");
	};

	return (
		<div className="flex min-h-dvh flex-col bg-background">
			{messages.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-32">
					<AlLogo className="size-40" />
					<p className="text-2xl font-bold text-foreground">Cześć, tu AL</p>
				</div>
			) : (
				<div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-44 sm:pb-32">
					<div className="flex flex-col gap-4">
						{messages.map((message, index) => (
							<ChatBubble
								key={`${index}-${message.role}`}
								message={message}
								streaming={isStreaming && index === messages.length - 1}
							/>
						))}
					</div>
				</div>
			)}

			<div className="sticky bottom-28 z-30 bg-background/95 p-3 backdrop-blur sm:bottom-0">
				<div className="mx-auto max-w-2xl">
					<BeamBorder active={input.trim() === "" && !isStreaming} className="rounded-2xl">
						<div className="rounded-2xl border border-primary/30 bg-card/80 p-3">
							<textarea
								value={input}
								onChange={(event) => setInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										submit();
									}
								}}
								placeholder="Napisz do AL…"
								aria-label="Wiadomość do AL"
								className="h-14 w-full resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
							/>
							<div className="mt-2 flex items-center gap-2">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											aria-label="Eksportuj konwersację"
											disabled={messages.length === 0}
											className="shrink-0 gap-1.5 hover:border-primary dark:hover:border-primary"
										>
											<Download className="size-4" />
											Export
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start">
										<DropdownMenuItem onClick={() => exportConversation(messages, "md")}>
											Markdown (.md)
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => exportConversation(messages, "txt")}>
											Tekst (.txt)
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => exportConversation(messages, "pdf")}>
											PDF (przez drukowanie)
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
								{messages.length > 0 && (
									<Button
										variant="ghost"
										size="sm"
										aria-label="Nowa rozmowa"
										onClick={clearConversation}
										className="shrink-0 gap-1.5"
									>
										<RotateCcw className="size-4" />
										Nowa rozmowa
									</Button>
								)}
								<div className="ml-auto">
									{isStreaming ? (
										<button
											type="button"
											onClick={stop}
											aria-label="Zatrzymaj generowanie"
											className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-background text-foreground shadow-[0_0_14px_-2px_var(--primary)] transition-opacity"
										>
											<Pause className="size-3.5 fill-current" />
										</button>
									) : (
										<button
											type="button"
											onClick={submit}
											disabled={!input.trim()}
											className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
										>
											<SendHorizontal className="size-4" />
											Wyślij
										</button>
									)}
								</div>
							</div>
						</div>
					</BeamBorder>
				</div>
			</div>
		</div>
	);
}

function ChatBubble({ message, streaming }: { message: UiChatMessage; streaming: boolean }) {
	if (message.role === "user") {
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
					<p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-start">
			<div className="max-w-[85%] py-1">
				{message.reasoning && (
					<ThinkingBlock reasoning={message.reasoning} live={streaming && !message.content} />
				)}
				{message.content.trim() ? (
					<>
						{message.reasoning && <div className="mb-2" />}
						<MarkdownText text={message.content} className="text-sm text-foreground" />
						{streaming && (
							<span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary align-text-bottom" />
						)}
					</>
				) : (
					<JellyOoze />
				)}
			</div>
		</div>
	);
}

/** Rozwijane „Myślenie" — reasoning modeli reasoningowych; domyślnie zwinięte. */
function ThinkingBlock({ reasoning, live }: { reasoning: string; live: boolean }) {
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground">
				<ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
				{live ? "AL myśli…" : "Myślenie AL"}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<p className="mt-1 mb-2 max-h-44 overflow-y-auto border-l-2 border-border pl-2 text-xs break-words whitespace-pre-wrap text-muted-foreground">
					{reasoning}
				</p>
			</CollapsibleContent>
		</Collapsible>
	);
}
