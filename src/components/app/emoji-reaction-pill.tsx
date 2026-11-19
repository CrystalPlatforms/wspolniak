// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, memo, type RefObject } from "react";
import type { ReactionType } from "@/db/post-reactions/reaction-types";
import { cn } from "@/lib/utils";
import { AppleEmoji } from "./apple-emoji";
import type { Particle } from "./emoji-burst";
import type { Placement } from "./emoji-reaction-picker";
import { REACTION_CONFIG } from "./reaction-config";

/**
 * Pill z emoji reakcji — prywatny, presentational moduł EmojiReactionPicker
 * (Reactions 3.0, #161). Lazy boundary motion (issue #239): plik z motion/react
 * ładuje się dopiero przy pierwszym otwarciu pickera; trigger (bez motion)
 * renderuje się od razu. Typy Placement/Particle przychodzą type-only —
 * w runtime picker nie importuje tego pliku statycznie.
 */

// Miękkie ease-out: ~65% dystansu w połowie czasu, więc animacja nie "staje".
const EASE: [number, number, number, number] = [0.4, 0.3, 0.5, 1];
const SWAY: [number, number, number, number] = [0, 0.3, 0.65, 1];

// memo — re-render rodzica restartowałby lot i odtwarzał delay od nowa.
const BurstEmoji = memo(function BurstEmoji({
	particle,
	size,
	onDone,
}: {
	particle: Particle;
	size: number;
	onDone: (id: number) => void;
}) {
	return (
		<motion.span
			className="pointer-events-none absolute z-0 will-change-transform"
			style={{
				left: particle.originX,
				top: particle.originY,
				marginLeft: -size / 2,
				marginTop: -size / 2,
			}}
			initial={{
				x: particle.x,
				y: 0,
				scale: 0.6,
				opacity: 0,
				rotate: 0,
				filter: "blur(0px)",
			}}
			animate={{
				// x dzieli ease z y — nadpisanie osobno wygięłoby tor w bok.
				x: particle.x + particle.drift,
				y: -particle.travel,
				scale: [0.6, particle.scale * 1.15, particle.scale, particle.scale * 0.75],
				rotate: [0, particle.tilt, -particle.tilt * 0.65, particle.tilt * 0.35],
				opacity: [0, 1, 1, 0],
				filter: ["blur(0px)", "blur(0px)", `blur(${particle.blurRatio * size}px)`],
			}}
			transition={{
				duration: particle.duration,
				delay: particle.delay,
				ease: EASE,
				// inherit: bez niego per-wartość transition podmienia całość.
				rotate: { inherit: true, times: SWAY, ease: "easeInOut" },
				scale: { inherit: true, times: [0, 0.1, 0.22, 1], ease: "easeOut" },
				opacity: {
					inherit: true,
					times: [0, 0.03, particle.fadeAt, 1],
					ease: "linear",
				},
				// blur bez nadpisanego ease — musi nadążać za krzywą wznoszenia.
				filter: { inherit: true, times: [0, 0.12, 1] },
			}}
			onAnimationComplete={() => onDone(particle.id)}
		>
			<AppleEmoji name={particle.name} size={size} className="max-w-none" />
		</motion.span>
	);
});

export interface EmojiReactionPillProps {
	top: boolean;
	placement: Placement;
	pillClass: string;
	emojiSize: number;
	burstSize: number;
	reactions: readonly ReactionType[];
	active: ReactionType | null;
	activeIndex: number;
	open: boolean;
	particles: Particle[];
	placeBar: (node: HTMLDivElement | null) => void;
	itemRefs: RefObject<(HTMLButtonElement | null)[]>;
	onMenuKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
	onFocusItem: (index: number) => void;
	startHold: (type: ReactionType, from: DOMRect) => void;
	stopHold: () => void;
	closeAfterBurst: () => void;
	onKeyboardReact: (type: ReactionType, from: DOMRect) => void;
	settle: (id: number) => void;
}

export default function EmojiReactionPill({
	top,
	placement,
	pillClass,
	emojiSize,
	burstSize,
	reactions,
	active,
	activeIndex,
	open,
	particles,
	placeBar,
	itemRefs,
	onMenuKeyDown,
	onFocusItem,
	startHold,
	stopHold,
	closeAfterBurst,
	onKeyboardReact,
	settle,
}: EmojiReactionPillProps) {
	const reduced = useReducedMotion();
	const burst = particles.map((particle) => (
		<BurstEmoji key={particle.id} particle={particle} size={burstSize} onDone={settle} />
	));

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					className="fixed z-50"
					initial={{
						opacity: 0,
						y: top ? 10 : -10,
						scale: 0.85,
					}}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: top ? 6 : -6, scale: 0.9 }}
					transition={
						reduced ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 30 }
					}
					style={{ left: placement.left, top: placement.top, originY: top ? 1 : 0 }}
				>
					<div
						ref={placeBar}
						role="menu"
						aria-label="Wybierz reakcję"
						aria-orientation="horizontal"
						onKeyDown={onMenuKeyDown}
						className={cn("relative flex items-center rounded-full bg-muted", pillClass)}
					>
						{burst}

						{reactions.map((type, i) => (
							<motion.button
								key={type}
								ref={(node) => {
									itemRefs.current[i] = node;
								}}
								type="button"
								role="menuitem"
								tabIndex={i === activeIndex ? 0 : -1}
								data-emoji={type}
								aria-label={REACTION_CONFIG[type].label}
								onFocus={() => onFocusItem(i)}
								onPointerDown={(event) =>
									startHold(type, event.currentTarget.getBoundingClientRect())
								}
								onPointerUp={() => {
									stopHold();
									closeAfterBurst();
								}}
								onPointerLeave={stopHold}
								onPointerCancel={stopHold}
								// Klawiatura: Enter/Space reaguje i zamyka (pointer obsłużył
								// onPointerDown/Up). preventDefault gasi syntezy clicka.
								onKeyDown={(event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									onKeyboardReact(type, event.currentTarget.getBoundingClientRect());
									closeAfterBurst();
								}}
								className={`relative z-10 rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									type === active ? "ring-2 ring-green-500" : ""
								}`}
								initial={reduced ? false : { scale: 0.4, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{
									type: "spring",
									stiffness: 800,
									damping: 25,
									delay: reduced ? 0 : 0.04 + i * 0.035,
								}}
								whileHover={reduced ? undefined : { scale: 1.28, y: -4 }}
								whileTap={{ scale: 0.92 }}
							>
								<AppleEmoji name={type} size={emojiSize} />
							</motion.button>
						))}
					</div>

					<span
						className={cn(
							"absolute size-3 -translate-x-1/2 rounded-full bg-muted",
							top ? "-bottom-1" : "-top-1",
						)}
						style={{ left: placement.tailX }}
					/>
					<span
						className={cn(
							"absolute size-1.5 -translate-x-1/2 rounded-full bg-muted",
							top ? "-bottom-4" : "-top-4",
						)}
						style={{ left: placement.tailX + 6 }}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
