// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import "./loader.css";

interface LoaderProps {
	loading?: boolean;
	size?: number;
	className?: string;
}

export function Loader({ loading = true, size = 6, className }: LoaderProps) {
	if (!loading) return null;
	return (
		<output
			className={cn("loader", className)}
			aria-label="Ładowanie"
			style={{ "--uib-size": `${size * 4}px` } as CSSProperties}
		>
			<div className="dot" />
			<div className="dot" />
			<div className="dot" />
			<div className="dot" />
			<div className="dot" />
			<div className="dot" />
		</output>
	);
}
