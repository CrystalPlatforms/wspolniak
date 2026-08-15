// SPDX-License-Identifier: AGPL-3.0-or-later
import { clampOffset, maxPan, pointDistance, scaleZoom } from "./use-pinch-zoom";

describe("pointDistance", () => {
	it("returns the Euclidean distance between two points", () => {
		expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
	});
});

describe("scaleZoom", () => {
	it("scales zoom by the distance ratio (spread = zoom in)", () => {
		const gesture = { startDistance: 100, startZoom: 1 };
		expect(scaleZoom(200, gesture)).toBe(2);
	});

	it("clamps the spread to MAX_ZOOM (10x)", () => {
		const gesture = { startDistance: 100, startZoom: 1 };
		expect(scaleZoom(1000, gesture)).toBe(10);
	});

	it("clamps the pinch to MIN_ZOOM (1x)", () => {
		const gesture = { startDistance: 100, startZoom: 1 };
		expect(scaleZoom(25, gesture)).toBe(1);
	});

	it("scales relative to the starting zoom when already zoomed (spread)", () => {
		const gesture = { startDistance: 100, startZoom: 2 };
		expect(scaleZoom(200, gesture)).toBe(4);
	});

	it("scales relative to the starting zoom when already zoomed (pinch in)", () => {
		const gesture = { startDistance: 100, startZoom: 3 };
		expect(scaleZoom(50, gesture)).toBe(1.5);
	});
});

describe("maxPan", () => {
	it("allows panning up to half the growth caused by zoom", () => {
		expect(maxPan(200, 2)).toBe(100);
		expect(maxPan(300, 10)).toBe(1350);
	});

	it("allows no panning at zoom 1", () => {
		expect(maxPan(200, 1)).toBe(0);
	});
});

describe("clampOffset", () => {
	it("clamps a pan offset so the image cannot escape its frame", () => {
		const offset = clampOffset({ x: 999, y: -999 }, 2, { width: 200, height: 100 });

		expect(offset).toEqual({ x: 100, y: -50 });
	});

	it("keeps offsets that are already within bounds", () => {
		const offset = clampOffset({ x: 40, y: -20 }, 2, { width: 200, height: 100 });

		expect(offset).toEqual({ x: 40, y: -20 });
	});

	it("zeroes the offset at zoom 1", () => {
		const offset = clampOffset({ x: 40, y: -20 }, 1, { width: 200, height: 100 });

		expect(offset).toEqual({ x: 0, y: 0 });
	});
});
