// SPDX-License-Identifier: AGPL-3.0-or-later

// Wspólniak Glass (#235, F2) — czysta matematyka soczewki, bez DOM:
// SDF zaokrąglonego prostokąta, numeryczna normalna krawędzi i kodowanie
// mapy przesunięć/poświaty do buforów RGBA (technika glisse odtworzona
// samodzielnie; glisse jest MIT i służy wyłącznie jako referencja).

/** Wymiary i promień soczewki w pikselach. */
export interface LensGeometry {
	width: number;
	height: number;
	radius: number;
}

/** Głębokość pasma refrakcji przy krawędzi, jako udział mniejszego boku. */
export const LENS_DEPTH_RATIO = 0.22;

const DEPTH_MIN = 8;
const DEPTH_MAX = 40;

/** Maksymalne przesunięcie próbkowania w pasmie (px) dla danej głębokości. */
export function maxShift(depth: number): number {
	return depth * 0.5;
}

/** Głębokość pasma (px) dla wymiarów soczewki. */
export function lensDepth(width: number, height: number): number {
	const smaller = Math.min(width, height);
	return Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, smaller * LENS_DEPTH_RATIO));
}

/** SDF zaokrąglonego prostokąta: ujemne wewnątrz, dodatnie na zewnątrz (px). */
export function roundedRectSdf(
	x: number,
	y: number,
	halfWidth: number,
	halfHeight: number,
	radius: number,
): number {
	const qx = Math.abs(x) - (halfWidth - radius);
	const qy = Math.abs(y) - (halfHeight - radius);
	const ox = Math.max(qx, 0);
	const oy = Math.max(qy, 0);
	const inside = Math.min(Math.max(qx, qy), 0);
	return inside + Math.hypot(ox, oy) - radius;
}

/** Numeryczna normalna krawędzi w punkcie (kierunek na zewnątrz, dł. 1). */
export function edgeNormal(x: number, y: number, geometry: LensGeometry): { x: number; y: number } {
	const halfWidth = geometry.width / 2;
	const halfHeight = geometry.height / 2;
	const eps = 0.75;
	const dx =
		roundedRectSdf(x + eps, y, halfWidth, halfHeight, geometry.radius) -
		roundedRectSdf(x - eps, y, halfWidth, halfHeight, geometry.radius);
	const dy =
		roundedRectSdf(x, y + eps, halfWidth, halfHeight, geometry.radius) -
		roundedRectSdf(x, y - eps, halfWidth, halfHeight, geometry.radius);
	const length = Math.hypot(dx, dy) || 1;
	return { x: dx / length, y: dy / length };
}

export interface LensMapBuffers {
	/** R = Δx, G = Δy; B neutralne, A znika tam, gdzie znika zginanie. */
	displacement: Uint8ClampedArray<ArrayBuffer>;
	/** Biała poświata krawędzi (rim), alpha od światła padającego z góry-lewo. */
	rim: Uint8ClampedArray<ArrayBuffer>;
	/** Wartość `scale` dla feDisplacementMap pasująca do zakodowanej mapy. */
	scale: number;
}

/** Kierunek światła rimu (z góry-lewo, jak w glisse). */
const LIGHT_X = -0.6;
const LIGHT_Y = -0.8;

/**
 * Koduje mapę soczewki do buforów RGBA: przesunięcie (R/G) w pasmie przy
 * krawędzi, poświata (rim) wg kąta normalnej do światła. Środek neutralny
 * (t=0 → alpha 0) — jak w technice Safari z glisse.
 */
export function encodeLensMap(width: number, height: number, radius: number): LensMapBuffers {
	const depth = lensDepth(width, height);
	const shift = maxShift(depth);
	const halfWidth = width / 2;
	const halfHeight = height / 2;
	const geometry: LensGeometry = { width, height, radius };
	const displacement = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
	const rim = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
	for (let py = 0; py < height; py += 1) {
		const y = py + 0.5 - halfHeight;
		for (let px = 0; px < width; px += 1) {
			const x = px + 0.5 - halfWidth;
			const d = roundedRectSdf(x, y, halfWidth, halfHeight, radius);
			// t = 1 przy krawędzi, 0 poza pasmem (głębiej w środku) — zginanie tylko
			// w pasmie o głębokości `depth` od krawędzi.
			const t = Math.min(1, Math.max(0, 1 + d / depth));
			const i = (py * width + px) * 4;
			const n = t > 0 ? edgeNormal(x, y, geometry) : { x: 0, y: 0 };
			displacement[i] = 128 - Math.round(128 * n.x * t);
			displacement[i + 1] = 128 - Math.round(128 * n.y * t);
			displacement[i + 2] = 128;
			displacement[i + 3] = Math.round(255 * t);
			if (t > 0) {
				const lit = Math.max(-(n.x * LIGHT_X + n.y * LIGHT_Y), 0);
				rim[i] = 255;
				rim[i + 1] = 255;
				rim[i + 2] = 255;
				rim[i + 3] = Math.round(255 * t * t * t * (0.12 + 0.6 * lit ** 3));
			}
		}
	}
	return { displacement, rim, scale: shift * 2 };
}
