// SPDX-License-Identifier: AGPL-3.0-or-later
import { Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UploadFlowError } from "@/images/upload";

/**
 * Alert błędu uploadu (issue #135): konkretny komunikat, ręczne ponowienie i
 * rozwijane szczegóły diagnostyczne (zamiast niemożliwego otwierania devtoolsów
 * przez stronę) — do skopiowania i wysłania adminowi.
 */
interface UploadErrorAlertProps {
	error: Error | null;
	/** Brak = alert bez przycisku ponowienia. */
	onRetry?: () => void;
	/** Blokada przycisku podczas ponawiania. */
	retryDisabled?: boolean;
}

/** Tekst diagnostyczny budowany w chwili otwarcia szczegółów. */
function buildDiagnostics(error: Error): string {
	const lines: string[] = [];
	if (error instanceof UploadFlowError) {
		lines.push(`Krok: ${error.step}`);
		lines.push(`Typ błędu: ${error.kind}`);
		if (error.detail) lines.push(`Szczegóły: ${error.detail}`);
		if (error.fileName) lines.push(`Plik: ${error.fileName}`);
	} else {
		lines.push(`Błąd: ${error.message}`);
	}
	lines.push(
		`Połączenie: ${typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"}`,
	);
	lines.push(`Czas: ${new Date().toISOString()}`);
	lines.push(
		`Przeglądarka: ${typeof navigator !== "undefined" ? navigator.userAgent : "nieznana"}`,
	);
	return lines.join("\n");
}

export function UploadErrorAlert({ error, onRetry, retryDisabled }: UploadErrorAlertProps) {
	const [showDetails, setShowDetails] = useState(false);
	if (!error) return null;

	const diagnostics = showDetails ? buildDiagnostics(error) : null;

	return (
		<Alert variant="destructive" className="mb-4">
			<AlertDescription>
				<span>{error.message}</span>
				<div className="mt-2 flex flex-wrap gap-2">
					{onRetry ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onRetry}
							disabled={retryDisabled}
						>
							<RotateCcw className="h-4 w-4" aria-hidden="true" />
							Spróbuj ponownie
						</Button>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setShowDetails((v) => !v)}
						aria-expanded={showDetails}
					>
						Szczegóły
					</Button>
					{showDetails ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								if (diagnostics && typeof navigator !== "undefined" && navigator.clipboard) {
									navigator.clipboard.writeText(diagnostics).catch(() => {
										// schowek niedostępny — szczegóły zostają zaznaczalne w bloku poniżej
									});
								}
							}}
						>
							<Copy className="h-4 w-4" aria-hidden="true" />
							Kopiuj
						</Button>
					) : null}
				</div>
				{diagnostics ? (
					<pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap text-foreground">
						{diagnostics}
					</pre>
				) : null}
			</AlertDescription>
		</Alert>
	);
}
