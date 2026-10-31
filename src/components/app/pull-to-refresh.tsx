// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface PullToRefreshProps {
	onRefresh: () => Promise<unknown> | unknown;
	children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
	const [pullDistance, setPullDistance] = useState(0);
	const [isPulling, setIsPulling] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const startY = useRef(0);
	const containerRef = useRef<HTMLDivElement>(null);

	const TRIGGER_THRESHOLD = 80;
	const MAX_PULL = 120;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let currentY = 0;

		const handleTouchStart = (e: TouchEvent) => {
			// Only trigger if at the top of the page
			if (window.scrollY === 0) {
				startY.current = e.touches[0].clientY;
				setIsPulling(true);
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (!isPulling) return;

			currentY = e.touches[0].clientY;
			const diff = currentY - startY.current;

			// Only pull down (positive diff), not up
			if (diff > 0) {
				// Add resistance to make it harder to pull
				const resistance = 0.4;
				const newDistance = Math.min(diff * resistance, MAX_PULL);
				setPullDistance(newDistance);

				// Prevent default scroll behavior when pulling (only if cancelable)
				if (diff > 10 && e.cancelable) {
					e.preventDefault();
				}
			}
		};

		const handleTouchEnd = async () => {
			if (!isPulling) return;
			setIsPulling(false);

			if (pullDistance >= TRIGGER_THRESHOLD && !isRefreshing) {
				setIsRefreshing(true);
				try {
					await onRefresh();
				} finally {
					setIsRefreshing(false);
				}
			}

			setPullDistance(0);
		};

		container.addEventListener("touchstart", handleTouchStart, { passive: true });
		container.addEventListener("touchmove", handleTouchMove, { passive: false });
		container.addEventListener("touchend", handleTouchEnd);

		return () => {
			container.removeEventListener("touchstart", handleTouchStart);
			container.removeEventListener("touchmove", handleTouchMove);
			container.removeEventListener("touchend", handleTouchEnd);
		};
	}, [isPulling, pullDistance, isRefreshing, onRefresh]);

	const progress = Math.min(pullDistance / TRIGGER_THRESHOLD, 1);

	return (
		<div ref={containerRef} className="relative min-h-screen">
			{/* Pull indicator */}
			<style>{`
				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
			`}</style>
			<div
				className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-transform duration-200 ease-out sm:hidden"
				style={{
					transform: `translateY(${Math.max(0, pullDistance - TRIGGER_THRESHOLD) * 0.5}px)`,
					opacity: pullDistance > 0 ? Math.min(progress, 1) : 0,
					height: `${Math.min(pullDistance, MAX_PULL)}px`,
					pointerEvents: "none",
				}}
			>
				<div
					className="flex items-center gap-2 text-muted-foreground"
					style={{
						transform: progress >= 1 ? "scale(1.1)" : `scale(${0.8 + progress * 0.2})`,
					}}
				>
					<IconRefresh
						className="h-5 w-5"
						style={{
							animation: isRefreshing ? "spin 1s linear infinite" : undefined,
							transform: `rotate(${pullDistance * 2}deg)`,
						}}
						aria-hidden="true"
					/>
					{pullDistance > TRIGGER_THRESHOLD && !isRefreshing && (
						<span className="text-sm">Puść, aby odświeżyć</span>
					)}
					{isRefreshing && <span className="text-sm">Odświeżanie...</span>}
				</div>
			</div>

			{children}
		</div>
	);
}
