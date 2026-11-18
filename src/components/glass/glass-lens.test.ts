// SPDX-License-Identifier: AGPL-3.0-or-later

// Czysta matematyka soczewki (#235): głębokość pasma, SDF, normalna i kodowanie
// mapy. Założenia kontraktu: środek mapy neutralny (R=G=128, A=0), pasmo tylko
// przy krawędzi, scale = 2·maxShift.

import { describe, expect, it } from "vitest";
import { edgeNormal, encodeLensMap, lensDepth, maxShift, roundedRectSdf } from "./glass-lens";

describe("glass lens math (#235)", () => {
	it("clamps lens depth to [8, 40] px", () => {
		expect(lensDepth(20, 20)).toBe(8);
		expect(lensDepth(400, 60)).toBe(13.2);
		expect(lensDepth(400, 400)).toBe(40);
	});

	it("maxShift is half the depth", () => {
		expect(maxShift(20)).toBe(10);
	});

	it("SDF: center negative, rim ~0, outside positive", () => {
		expect(roundedRectSdf(0, 0, 100, 50, 16)).toBeLessThan(0);
		expect(roundedRectSdf(100, 0, 100, 50, 16)).toBeCloseTo(0, 5);
	});

	it("edgeNormal: unit length, points outward (top edge -> y<0)", () => {
		const g = { width: 200, height: 100, radius: 16 };
		const top = edgeNormal(0, -48, g);
		expect(top.y).toBeLessThan(0);
		expect(Math.hypot(top.x, top.y)).toBeCloseTo(1, 5);
	});

	it("encodeLensMap: neutral center, bent rim band, scale = 2·maxShift", () => {
		const w = 120;
		const h = 56;
		const r = 12;
		const { displacement, rim, scale } = encodeLensMap(w, h, r);
		const centerI = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4;
		expect(displacement[centerI + 3]).toBe(0); // alpha-fade środka (Safari)
		expect(displacement[centerI]).toBe(128); // neutralny szary (R)
		expect(displacement[centerI + 1]).toBe(128); // neutralny szary (G)
		const topBand = (8 * w + 60) * 4;
		expect(displacement[topBand + 3] ?? 0).toBeGreaterThan(0);
		expect(rim[topBand + 3] ?? 0).toBeGreaterThan(0);
		expect(scale).toBe(maxShift(lensDepth(w, h)) * 2);
	});
});
