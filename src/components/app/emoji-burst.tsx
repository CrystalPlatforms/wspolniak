// SPDX-License-Identifier: AGPL-3.0-or-later

import { motion } from "motion/react";
import { memo } from "react";
import { AppleEmoji } from "./apple-emoji";

/** Ile kopii emoji wylatuje przy jednym kliknięciu. */
const BURST_COUNT = 5;
/** Twardy limit cząsteczek w DOM (hold-to-repeat nie może ich mnożyć w nieskończoność). */
export const MAX_PARTICLES = 60;
/** Wysokość lotu w px. */
const RISE = 450;
const LAUNCH_SPREAD = 6;
const CLIMB_SPREAD = 78;
// Miękkie ease-out: ~65% dystansu w połowie czasu, więc animacja nie "staje".
const EASE: [number, number, number, number] = [0.4, 0.3, 0.5, 1];
const SWAY: [number, number, number, number] = [0, 0.3, 0.65, 1];

export interface Particle {
	id: number;
	name: string;
	originX: number;
	originY: number;
	x: number;
	drift: number;
	tilt: number;
	travel: number;
	scale: number;
	blurRatio: number;
	fadeAt: number;
	duration: number;
	delay: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function makeParticles(name: string, seed: number, from: DOMRect, bar: DOMRect): Particle[] {
	const originX = from.left + from.width / 2 - bar.left;
	const originY = from.top + from.height / 2 - bar.top;

	return Array.from({ length: BURST_COUNT }, (_, i) => {
		const lane = rand(-1, 1);
		const dir = lane < 0 ? -1 : 1;
		return {
			id: seed + i,
			name,
			originX,
			originY,
			x: lane * LAUNCH_SPREAD,
			drift: lane * CLIMB_SPREAD,
			tilt: rand(1, 4) * dir,
			travel: RISE * rand(0.86, 1),
			scale: rand(0.78, 1.05),
			blurRatio: rand(0.18, 0.3),
			fadeAt: rand(0.55, 0.88),
			duration: rand(1.4, 1.8),
			delay: i * 0.25,
		};
	});
}

// memo — re-render rodzica restartowałby lot i odtwarzał delay od nowa.
export const BurstEmoji = memo(function BurstEmoji({
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
