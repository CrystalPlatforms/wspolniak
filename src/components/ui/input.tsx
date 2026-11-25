// SPDX-License-Identifier: AGPL-3.0-or-later
import type * as React from "react";
import { cn } from "@/lib/utils";
import { FIELD_CLASS } from "./field-styles";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				FIELD_CLASS,
				"h-9 min-w-0 px-3 py-1 text-base md:text-sm selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
