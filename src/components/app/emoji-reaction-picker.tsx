// SPDX-License-Identifier: AGPL-3.0-or-later

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactionType } from "@/db/post-reactions/table";
import { cn } from "@/lib/utils";
import { AppleEmoji } from "./apple-emoji";
import type { Particle } from "./emoji-burst";
import { BurstEmoji, MAX_PARTICLES, makeParticles } from "./emoji-burst";
import { REACTION_CONFIG, REACTION_ORDER } from "./reaction-config";

const HOLD_INTERVAL = 550;
/** Bezpiecznik zamykania po burstcie: max czas lotu cząsteczki ~1.8 s + delayi. */
const BURST_MAX_WAIT_MS = 3400;
const GAP = 16;
const EDGE = 8;

const SIZES = {
	sm: { trigger: "size-8", icon: 16, emoji: 26, pill: "gap-0.5 p-1", burst: 26 },
	md: { trigger: "size-10", icon: 20, emoji: 34, pill: "gap-1 p-1.5", burst: 34 },
	lg: { trigger: "size-12", icon: 24, emoji: 42, pill: "gap-1.5 p-2", burst: 42 },
} as const;

type Align = "left" | "center" | "right";

type Placement = { side: "top" | "bottom"; shift: number; tailX: number };

function SmilePlusIcon({ size }: { size: number }) {
	return (
		// biome-ignore lint/a11y/noSvgWithoutTitle: dekoracyjna ikona triggera — znaczenie niesie aria-label przycisku
		<svg viewBox="0 0 24 24" fill="none" aria-hidden width={size} height={size}>
			<path
				d="M21 12a9 9 0 1 1-9-9"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
			/>
			<circle cx="8.9" cy="10" r="1.35" fill="currentColor" />
			<circle cx="15.1" cy="10" r="1.35" fill="currentColor" />
			<path
				d="M8 13.9a4.7 4.7 0 0 0 8 0"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
			/>
			<path d="M19 2.5v5M21.5 5h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
		</svg>
	);
}

function getPlacement(trigger: DOMRect, width: number, height: number, align: Align): Placement {
	const anchored =
		align === "left"
			? trigger.left
			: align === "right"
				? trigger.right - width
				: trigger.left + trigger.width / 2 - width / 2;

	const overhangLeft = EDGE - anchored;
	const overhangRight = anchored + width - (window.innerWidth - EDGE);
	const shift = overhangLeft > 0 ? overhangLeft : overhangRight > 0 ? -overhangRight : 0;

	return {
		side: trigger.top - height - GAP < EDGE ? "bottom" : "top",
		shift,
		// Ogonek zostaje nad triggerem niezależnie od align i shift.
		tailX: trigger.left + trigger.width / 2 - (anchored + shift),
	};
}

export interface EmojiReactionPickerProps {
	/** Reakcje w pillu; default = pełna kolejność REACTION_ORDER. */
	reactions?: readonly ReactionType[];
	onReact: (type: ReactionType) => void;
	/** Ostatnia reakcja usera — pokazywana na triggerze. */
	last?: ReactionType | null;
	/** Moja aktualna reakcja — zielony ring na tej emoji w rozwiniętym pillu. */
	active?: ReactionType | null;
	size?: keyof typeof SIZES;
	align?: Align;
	disabled?: boolean;
	className?: string;
	/** Tryb kontrolowany — otwarcie sterowane z zewnątrz (np. „Zareaguj" w menu czatu). */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Ukryj wbudowany trigger — używane z trybem kontrolowanym (samo otwarcie pilli). */
	hideTrigger?: boolean;
}

/**
 * Trigger + pill z emoji (Reactions 3.0, #161): otwarcie na klik (lub drag),
 * burst cząsteczek nad wybraną emoji, hold-to-repeat, strzałki/Home/End,
 * Escape zamyka i wraca focus na trigger. Wybór emoji zamyka pill.
 */
export function EmojiReactionPicker({
	reactions = REACTION_ORDER,
	onReact,
	last = null,
	active = null,
	size = "md",
	align = "center",
	disabled = false,
	className,
	open: controlledOpen,
	onOpenChange,
	hideTrigger = false,
}: EmojiReactionPickerProps) {
	const s = SIZES[size];
	const reduced = useReducedMotion();

	// Tryb kontrolowany (open podane) albo wewnętrzny stan — wspólny setter.
	const isControlled = controlledOpen !== undefined;
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = isControlled ? controlledOpen : uncontrolledOpen;
	const setOpen = useCallback(
		(next: boolean) => {
			if (isControlled) onOpenChange?.(next);
			else setUncontrolledOpen(next);
		},
		[isControlled, onOpenChange],
	);

	const [particles, setParticles] = useState<Particle[]>([]);
	const [placement, setPlacement] = useState<Placement>({
		side: "top",
		shift: 0,
		tailX: 0,
	});
	const [activeIndex, setActiveIndex] = useState(0);
	// Po wyborze emoji pill czeka na koniec lotu cząsteczek (życzenie HITL #161).
	const [closeWhenSettled, setCloseWhenSettled] = useState(false);

	const rootRef = useRef<HTMLDivElement>(null);
	const barRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const seed = useRef(0);
	const hold = useRef<number | null>(null);
	const justOpened = useRef(false);

	const stopHold = useCallback(() => {
		if (hold.current === null) return;
		window.clearInterval(hold.current);
		hold.current = null;
	}, []);

	// Zamknięcie odmontowuje kopie emoji w locie — ich onAnimationComplete
	// nigdy nie przyjdzie, więc cząsteczki czyszczimy od razu.
	const close = useCallback(() => {
		stopHold();
		setOpen(false);
		setParticles([]);
		setCloseWhenSettled(false);
	}, [stopHold, setOpen]);

	// Wybór emoji: pill chowa się dopiero, gdy ostatnia cząsteczka skończy
	// lot; bezpiecznik czasowy na wstrzymany rAF (karta w tle) — pill nie wisi.
	const closeAfterBurst = useCallback(() => {
		stopHold();
		setCloseWhenSettled(true);
	}, [stopHold]);

	useEffect(() => {
		if (!closeWhenSettled) return;
		if (particles.length === 0) {
			close();
			return;
		}
		const timer = window.setTimeout(close, BURST_MAX_WAIT_MS);
		return () => window.clearTimeout(timer);
	}, [closeWhenSettled, particles.length, close]);

	// Ref callback zamiast efektu — pomiar nie kaskaduje dodatkowego renderu.
	const placeBar = useCallback(
		(node: HTMLDivElement | null) => {
			barRef.current = node;
			const trigger = triggerRef.current;
			if (!node || !trigger) return;
			setPlacement(
				getPlacement(trigger.getBoundingClientRect(), node.offsetWidth, node.offsetHeight, align),
			);
		},
		[align],
	);

	useEffect(() => {
		if (!open) return;

		const onPointerDown = (event: globalThis.PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) close();
		};
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key !== "Escape") return;
			close();
			triggerRef.current?.focus();
		};

		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, close]);

	useEffect(() => {
		if (!open) return;
		// Focus w następnym makrotasku — późniejsze przeniesienie focusu przez
		// click na trigger (kolejność zdarzeń w testach) nie nadpisze celu.
		const id = window.setTimeout(() => itemRefs.current[0]?.focus(), 0);
		return () => window.clearTimeout(id);
	}, [open]);

	const react = useCallback(
		(type: ReactionType, from: DOMRect) => {
			onReact(type);

			const bar = barRef.current?.getBoundingClientRect();
			if (reduced || !bar) return;
			seed.current += MAX_PARTICLES; // unikalne id niezależnie od BURST_COUNT
			setParticles((prev) =>
				[...prev, ...makeParticles(type, seed.current, from, bar)].slice(-MAX_PARTICLES),
			);
		},
		[onReact, reduced],
	);

	const startHold = useCallback(
		(type: ReactionType, from: DOMRect) => {
			react(type, from);
			stopHold();
			hold.current = window.setInterval(() => react(type, from), HOLD_INTERVAL);
		},
		[react, stopHold],
	);

	useEffect(() => stopHold, [stopHold]);

	const settle = useCallback((id: number) => {
		setParticles((prev) => prev.filter((particle) => particle.id !== id));
	}, []);

	// Wciśnięcie triggera i przeciągnięcie po pillu — puszczenie nad emoji ją wybiera.
	const onTriggerPointerDown = useCallback(() => {
		if (disabled || open) return;
		setOpen(true);
		justOpened.current = true;

		const up = (event: globalThis.PointerEvent) => {
			document.removeEventListener("pointerup", up);

			// Drag-pick: emoji pod kursorem w chwili puszczenia. try/catch —
			// środowiska bez layoutu (jsdom) rzucają z elementFromPoint.
			let picked: HTMLElement | null = null;
			try {
				picked =
					(
						document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
					)?.closest<HTMLElement>("[data-emoji]") ?? null;
			} catch {
				picked = null;
			}
			if (picked?.dataset.emoji) {
				react(picked.dataset.emoji as ReactionType, picked.getBoundingClientRect());
				closeAfterBurst();
			}

			// Click nad triggerem zdąży się odpalić przed timeoutem (ten sam gest);
			// puszczenie poza triggerem nie generuje clicka — flagę czyści timeout.
			window.setTimeout(() => {
				justOpened.current = false;
			}, 0);
		};

		document.addEventListener("pointerup", up);
	}, [disabled, open, react, setOpen, closeAfterBurst]);

	const onMenuKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			const count = reactions.length;
			let next = activeIndex;

			if (event.key === "ArrowRight") next = (activeIndex + 1) % count;
			else if (event.key === "ArrowLeft") next = (activeIndex - 1 + count) % count;
			else if (event.key === "Home") next = 0;
			else if (event.key === "End") next = count - 1;
			else return;

			event.preventDefault();
			setActiveIndex(next);
			itemRefs.current[next]?.focus();
		},
		[activeIndex, reactions.length],
	);

	const burst = particles.map((particle) => (
		<BurstEmoji key={particle.id} particle={particle} size={s.burst} onDone={settle} />
	));

	const top = placement.side === "top";
	const anchor = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2";
	const centering = align === "center" ? "-50%" : 0;
	// Pill zakotwiczony prawą krawędzią — lewy margin go nie przesunie.
	const nudge =
		align === "right" ? { marginRight: -placement.shift } : { marginLeft: placement.shift };

	const triggerLabel = open
		? "Zamknij reakcje"
		: last
			? `Reagowano ${REACTION_CONFIG[last].label}`
			: "Dodaj reakcję";

	return (
		<div
			ref={rootRef}
			data-slot="emoji-reaction-picker"
			className={cn("relative flex w-fit items-center", className)}
		>
			<AnimatePresence>
				{open && (
					<motion.div
						className={cn("absolute z-30", anchor, top ? "bottom-full mb-4" : "top-full mt-4")}
						initial={{
							opacity: 0,
							y: top ? 10 : -10,
							scale: 0.85,
							x: centering,
						}}
						animate={{ opacity: 1, y: 0, scale: 1, x: centering }}
						exit={{ opacity: 0, y: top ? 6 : -6, scale: 0.9, x: centering }}
						transition={
							reduced ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 30 }
						}
						style={{ originY: top ? 1 : 0, ...nudge }}
					>
						<div
							ref={placeBar}
							role="menu"
							aria-label="Wybierz reakcję"
							aria-orientation="horizontal"
							onKeyDown={onMenuKeyDown}
							className={cn("relative flex items-center rounded-full bg-muted", s.pill)}
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
									onFocus={() => setActiveIndex(i)}
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
										react(type, event.currentTarget.getBoundingClientRect());
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
									<AppleEmoji name={type} size={s.emoji} />
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

			{!hideTrigger && (
				<button
					ref={triggerRef}
					type="button"
					aria-haspopup="true"
					aria-expanded={open}
					aria-label={triggerLabel}
					disabled={disabled}
					onPointerDown={onTriggerPointerDown}
					onClick={() => {
						if (justOpened.current) {
							justOpened.current = false;
							return;
						}
						if (open) close();
						else if (!disabled) setOpen(true);
					}}
					className={cn(
						"relative z-10 grid place-items-center rounded-full bg-muted text-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
						s.trigger,
					)}
				>
					{open ? (
						<X size={s.icon} strokeWidth={2} />
					) : last ? (
						<AppleEmoji name={last} size={Math.round(s.emoji * 0.72)} />
					) : (
						<SmilePlusIcon size={s.icon} />
					)}
				</button>
			)}
		</div>
	);
}
