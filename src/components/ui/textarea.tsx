// SPDX-License-Identifier: AGPL-3.0-or-later
import type * as React from "react";
import { cn } from "@/lib/utils";
import { FIELD_CLASS } from "./field-styles";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				FIELD_CLASS,
				"flex field-sizing-content min-h-16 px-3 py-2 text-base md:text-sm",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
