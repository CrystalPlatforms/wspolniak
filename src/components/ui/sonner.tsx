// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";

// Wrapper Toastera sonner dopasowany do motywu aplikacji (light/dark).
// `toast.*` importuje się bezpośrednio z "sonner" w komponentach; tu tylko montaż.
function Toaster({ ...props }: ComponentProps<typeof Sonner>) {
	const { resolvedTheme } = useTheme();

	return (
		<Sonner
			theme={resolvedTheme === "dark" ? "dark" : "light"}
			richColors
			position="bottom-center"
			toastOptions={{
				classNames: {
					toast: "rounded-lg border border-border bg-popover text-popover-foreground",
				},
			}}
			{...props}
		/>
	);
}

export { Toaster };
