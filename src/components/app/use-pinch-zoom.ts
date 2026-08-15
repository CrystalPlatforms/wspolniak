// SPDX-License-Identifier: AGPL-3.0-or-later
import { useRef } from "react";

/** Minimum zoom level (image at its natural size). */
export const MIN_ZOOM = 1;
/** Maximum zoom level reachable via pinch or buttons. */
export const MAX_ZOOM = 10;

export interface Point {
	x: number;
	y: number;
}

/** A screen point coming from a touch / mouse event. */
export interface TouchPoint {
	clientX: number;
	clientY: number;
}

/**
 * Euclidean distance between two points (e.g. two fingers on the screen).
 */
export function pointDistance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface PinchGesture {
	/** Distance between the two fingers when the pinch started. */
	startDistance: number;
	/** Zoom level when the pinch started. */
	startZoom: number;
}

/**
 * Next zoom level for an ongoing pinch, derived from how far the fingers
 * have moved relative to where they started.
 */
export function scaleZoom(currentDistance: number, gesture: PinchGesture): number {
	if (gesture.startDistance === 0) return gesture.startZoom;
	const ratio = currentDistance / gesture.startDistance;
	return clamp(gesture.startZoom * ratio, MIN_ZOOM, MAX_ZOOM);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export interface Size {
	width: number;
	height: number;
}

/**
 * How far (px) the image may be panned along one axis at the given zoom,
 * i.e. half the extra size the zoom grows beyond the displayed size. Keeps
 * the image from being dragged outside its frame.
 */
export function maxPan(displayedSize: number, zoom: number): number {
	return Math.max(0, (displayedSize * (zoom - 1)) / 2);
}

/**
 * Clamps a pan offset so the zoomed image never leaves its frame.
 * At zoom 1 there is nothing to pan, so the offset collapses to zero.
 */
export function clampOffset(offset: Point, zoom: number, size: Size): Point {
	if (zoom <= MIN_ZOOM) return { x: 0, y: 0 };
	const maxX = maxPan(size.width, zoom);
	const maxY = maxPan(size.height, zoom);
	return {
		x: clamp(offset.x, -maxX, maxX),
		y: clamp(offset.y, -maxY, maxY),
	};
}

interface UsePinchZoomArgs {
	/** Current zoom level (captured when the pinch starts). */
	zoom: number;
	/** Called with the next zoom level on every pinch move. */
	onZoomChange: (next: number) => void;
	/** Called when the pinch returns to MIN_ZOOM, to clear any pan offset. */
	onOffsetReset: () => void;
}

/**
 * Owns the geometry of a two-finger pinch-to-zoom gesture. Composes with — and
 * must be consulted before — any single-finger touch logic: the caller branches
 * on two touches and hands them to `beginPinch` / `movePinch`.
 */
export function usePinchZoom({ zoom, onZoomChange, onOffsetReset }: UsePinchZoomArgs) {
	const gestureRef = useRef<PinchGesture | null>(null);

	const beginPinch = (touches: TouchPoint[]) => {
		const a = touches[0];
		const b = touches[1];
		if (!a || !b) return;
		gestureRef.current = {
			startDistance: pointDistance(toPoint(a), toPoint(b)),
			startZoom: zoom,
		};
	};

	const movePinch = (touches: TouchPoint[]) => {
		const gesture = gestureRef.current;
		if (!gesture) return;
		const a = touches[0];
		const b = touches[1];
		if (!a || !b) return;
		const next = scaleZoom(pointDistance(toPoint(a), toPoint(b)), gesture);
		onZoomChange(next);
		if (next <= MIN_ZOOM) onOffsetReset();
	};

	const endPinch = () => {
		gestureRef.current = null;
	};

	const isPinching = () => gestureRef.current !== null;

	return { beginPinch, movePinch, endPinch, isPinching };
}

function toPoint(touch: TouchPoint): Point {
	return { x: touch.clientX, y: touch.clientY };
}
