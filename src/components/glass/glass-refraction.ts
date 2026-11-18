// SPDX-License-Identifier: AGPL-3.0-or-later

// Wspólniak Glass (#235, F2) — warstwa DOM refrakcji: singleton defs (jeden
// svg na dokument), montaż filtra SVG z mapy soczewki i dopasowanie per
// element. Środowiska bez canvas (jsdom) dostają blur-only — graceful
// degradation (AC #235). glisse = referencja (MIT), zero zależności npm.

import { encodeLensMap } from "./glass-lens";

/** Atrybut rozpoznawczy kontenera defs — dokładnie jeden na dokument (AC #235). */
export const GLASS_REFRACTION_DEFS_ATTR = "data-glass-refraction";

const SVG_NS = "http://www.w3.org/2000/svg";

interface ChromeFilter {
	id: string;
	/** dataURL poświaty krawędzi dla --glass-rim. */
	rim: string | null;
}

const filterCache = new Map<string, ChromeFilter>();
const MAX_FILTERS = 24;

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
	const el = document.createElementNS(SVG_NS, name);
	for (const [key, value] of Object.entries(attrs)) {
		el.setAttribute(key, String(value));
	}
	return el;
}

function toDataUrl(
	pixels: Uint8ClampedArray<ArrayBuffer>,
	width: number,
	height: number,
): string | null {
	if (typeof document === "undefined") return null;
	try {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
		return canvas.toDataURL();
	} catch {
		return null;
	}
}

function normalizedRadius(radius: number, width: number, height: number): number {
	const max = Math.min(width, height) / 2;
	return Math.min(max, Math.max(0, radius));
}

/**
 * Singleton defs: dokładnie jeden svg[data-glass-refraction] w dokumencie
 * (AC #235: filter defs exactly once per document). Filtry dopisujemy do
 * niego per rozmiar (cache), nigdy per instancja elementu.
 */
export function ensureRefractionDefs(): SVGSVGElement {
	if (typeof document === "undefined") {
		throw new Error("ensureRefractionDefs jest client-only");
	}
	const existing = document.querySelector(`svg[${GLASS_REFRACTION_DEFS_ATTR}]`);
	if (existing) return existing as SVGSVGElement;
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute(GLASS_REFRACTION_DEFS_ATTR, "");
	svg.setAttribute("width", "0");
	svg.setAttribute("height", "0");
	svg.setAttribute("aria-hidden", "true");
	const defs = document.createElementNS(SVG_NS, "defs");
	svg.appendChild(defs);
	document.body.appendChild(svg);
	return svg as unknown as SVGSVGElement;
}

/**
 * Filtr chrome per (szer × wys × promień): cache, singleton defs, mapa z
 * encodeLensMap + rim z tej samej iteracji. Zwraca null, gdy środowisko nie
 * umie zbudować mapy (jsdom) — wtedy zostaje samo rozmycie.
 */
export function ensureChromeFilter(
	width: number,
	height: number,
	radius: number,
): ChromeFilter | null {
	if (typeof document === "undefined") return null;
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const r = normalizedRadius(radius, w, h);
	const key = `${w}x${h}x${r}`;
	const cached = filterCache.get(key) as ChromeFilter | undefined;
	if (cached) return cached;
	if (filterCache.size >= MAX_FILTERS) filterCache.clear();
	try {
		const buffers = encodeLensMap(w, h, r);
		const displacementUrl = toDataUrl(buffers.displacement, w, h);
		const rimUrl = toDataUrl(buffers.rim, w, h);
		if (!displacementUrl) return null;
		const defs = ensureRefractionDefs();
		const filterId = `glass-r-${key}`;
		const filter = svgEl("filter", {
			id: filterId,
			x: 0,
			y: 0,
			width: w,
			height: h,
			filterUnits: "userSpaceOnUse",
			primitiveUnits: "userSpaceOnUse",
			"color-interpolation-filters": "sRGB",
		});
		filter.appendChild(
			svgEl("feImage", {
				href: displacementUrl,
				x: 0,
				y: 0,
				width: w,
				height: h,
				preserveAspectRatio: "none",
				result: "field",
			}),
		);
		const chromatic: Array<[string, number, string]> = [
			["r", 1.035, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
			["g", 1.0, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
			["b", 0.965, "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
		];
		for (const [channel, factor, matrix] of chromatic) {
			filter.appendChild(
				svgEl("feDisplacementMap", {
					in: "SourceGraphic",
					in2: "field",
					scale: String(buffers.scale * factor),
					xChannelSelector: "R",
					yChannelSelector: "G",
					result: `${channel}-ray`,
				}),
			);
			filter.appendChild(
				svgEl("feColorMatrix", {
					in: `${channel}-ray`,
					type: "matrix",
					values: matrix,
					result: channel,
				}),
			);
		}
		filter.appendChild(
			svgEl("feComposite", {
				in: "r",
				in2: "g",
				operator: "arithmetic",
				k2: 1,
				k3: 1,
				result: "rg",
			}),
		);
		filter.appendChild(
			svgEl("feComposite", {
				in: "rg",
				in2: "b",
				operator: "arithmetic",
				k2: 1,
				k3: 1,
			}),
		);
		defs.appendChild(filter);
		const result: ChromeFilter = { id: filterId, rim: rimUrl };
		filterCache.set(key, result);
		return result;
	} catch {
		return null;
	}
}

/** Reset do testów: kasuje singleton defs i cache filtrów. */
export function resetRefractionForTests(): void {
	for (const node of document.querySelectorAll(`svg[${GLASS_REFRACTION_DEFS_ATTR}]`)) {
		node.remove();
	}
	filterCache.clear();
}
