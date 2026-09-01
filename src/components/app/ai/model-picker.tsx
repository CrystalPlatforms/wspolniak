// SPDX-License-Identifier: AGPL-3.0-or-later

import { Bot, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { AI_MODELS } from "@/core/ai/models";
import { cn } from "@/lib/utils";

interface ModelPickerProps {
	/** Aktualnie wybrany model (id Groq — widoczne tylko tu, nie w UI wpisu). */
	modelId: string;
	/** Ustawia model na następne odpowiedzi; historia zostaje nietknięta. */
	onSelect: (modelId: string) => void;
}

/**
 * Dialog „Wybierz model:" (F4 #182) — jedno źródło prawdy: AI_MODELS.
 * Każdy wpis pokazuje wyłącznie nazwę AL (Max/Pro/Lite), badge i limit/min —
 * prawdziwe id Groqa i żaden żargon dostawcy nie trafiają do UI.
 */
export function ModelPicker({ modelId, onSelect }: ModelPickerProps) {
	const [open, setOpen] = useState(false);
	const selected = AI_MODELS.find((model) => model.id === modelId);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					aria-label="Wybierz model AL"
					className="shrink-0 gap-1.5 hover:border-primary dark:hover:border-primary"
				>
					<Bot className="size-4" />
					{selected?.uiName ?? "Model"}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Wybierz model:</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-1">
					{AI_MODELS.map((model) => (
						<button
							key={model.id}
							type="button"
							onClick={() => {
								onSelect(model.id);
								setOpen(false);
							}}
							className={cn(
								"flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent",
								model.id === modelId && "bg-accent/50",
							)}
						>
							<span className="flex min-w-0 flex-col gap-0.5">
								<span className="flex items-center gap-2">
									<span className="text-sm font-medium text-foreground">{model.uiName}</span>
									{model.badge && (
										<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
											{model.badge}
										</span>
									)}
								</span>
								<span className="text-xs text-muted-foreground">
									{model.perMinuteLimit} odp./min
								</span>
							</span>
							{model.id === modelId && <Check className="size-4 shrink-0 text-primary" />}
						</button>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
