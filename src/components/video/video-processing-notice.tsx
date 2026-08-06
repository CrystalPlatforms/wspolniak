// SPDX-License-Identifier: AGPL-3.0-or-later
import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Informacja pokazywana po udanym uploadie wideo: film musi zostać przetworzony,
 * zanim będzie w pełni oglądalny (od 2 do 5 minut). Czysty, statyczny komunikat.
 */
export function VideoProcessingNotice() {
	return (
		<Alert className="mt-4">
			<Info className="h-4 w-4 text-muted-foreground" />
			<AlertDescription>
				Film musi zostać przetworzony, aby był całkowicie oglądalny. To może zająć od 2 do 5 minut.
			</AlertDescription>
		</Alert>
	);
}
