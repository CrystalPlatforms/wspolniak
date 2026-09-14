// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Loader } from "@/components/ui/loader";
import { ShrinkError, shrinkImageToLimit } from "@/images/shrink";

function formatSizeMb(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(mb)} MB`;
}

interface OversizedImageDialogProps {
	/** Za duży plik do zmniejszenia (null = dialog zamknięty). */
	file: File | null;
	/** Limit rozmiaru w MB — komunikat i próg zmniejszania. */
	limitMb: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Wywoływane po udanym zmniejszeniu — parent podmienia plik w liście mediów. */
	onShrunk: (file: File) => void;
}

/**
 * Dialog błędu „za duże zdjęcie" (issue #200): pokazuje nazwę pliku, rzeczywisty
 * rozmiar i limit, a akcja „Zmniejsz zdjęcie" realnie redukuje rozmiar pliku
 * (shrinkImageToLimit) i oddaje wynik parentowi przez `onShrunk`. Zmniejszanie
 * idzie przez Web Worker (compressImage), więc UI nie zamarza.
 */
export function OversizedImageDialog({
	file,
	limitMb,
	open,
	onOpenChange,
	onShrunk,
}: OversizedImageDialogProps) {
	const [isShrinking, setIsShrinking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// nowy plik = nowa sesja dialogu — czyścimy błąd z poprzedniej
	useEffect(() => {
		setError(null);
	}, []);

	const handleShrink = useCallback(async () => {
		if (!file) return;
		setIsShrinking(true);
		setError(null);
		try {
			const shrunk = await shrinkImageToLimit(file, limitMb * 1024 * 1024);
			onShrunk(shrunk);
		} catch (error) {
			setError(
				error instanceof ShrinkError
					? error.message
					: "Nie udało się zmniejszyć zdjęcia — spróbuj ponownie albo dodaj mniejsze.",
			);
		} finally {
			setIsShrinking(false);
		}
	}, [file, limitMb, onShrunk]);

	return (
		<Dialog open={open && file !== null} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Zdjęcie jest za duże</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					Plik „{file?.name}" ma {file ? formatSizeMb(file.size) : "?"} — limit to {limitMb} MB.
				</p>
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<DialogFooter className="flex-row gap-2">
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Anuluj
					</Button>
					<Button type="button" onClick={handleShrink} disabled={isShrinking}>
						{isShrinking ? (
							<>
								<Loader loading size={4} className="mr-2" />
								Zmniejszanie…
							</>
						) : (
							"Zmniejsz zdjęcie"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
