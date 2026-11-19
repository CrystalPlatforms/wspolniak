// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Czysta logika burstu emoji — bez motion (issue #239). Render cząsteczek
 * (BurstEmoji) żyje w emoji-reaction-pill.tsx, za lazy boundary motion.
 */

/** Ile kopii emoji wylatuje przy jednym kliknięciu. */
const BURST_COUNT = 5;
/** Twardy limit cząsteczek w DOM (hold-to-repeat nie może ich mnożyć w nieskończoność). */
export const MAX_PARTICLES = 60;
/** Wysokość lotu w px. */
const RISE = 450;
const LAUNCH_SPREAD = 6;
const CLIMB_SPREAD = 78;

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
