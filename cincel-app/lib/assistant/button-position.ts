/**
 * Pure geometry for the floating assistant button: drag threshold, edge snap,
 * clamping and keyboard steps. No DOM access, so every rule is unit-testable.
 */

export type ButtonSide = "left" | "right";

/** Stored position: the edge it sits on and its top edge as a fraction of the viewport height. */
export type ButtonPosition = { side: ButtonSide; y: number };

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/** Safe margins the button must keep from the viewport edges, in px. */
export type Insets = { top: number; right: number; bottom: number; left: number };

/** Pointer travel before a press turns into a drag. */
export const DRAG_THRESHOLD_PX = 5;

/** Alt+ArrowUp / ArrowDown step, as a fraction of the viewport height. */
export const KEY_STEP = 0.1;

/** Bottom-right, where the button lived before it could move. */
export const DEFAULT_BUTTON_POSITION: ButtonPosition = { side: "right", y: 1 };

/** Below this viewport width the layout is the phone one (no sidebar, bottom tabs). */
export const DESKTOP_MIN_WIDTH = 768;
export const SIDEBAR_WIDTH_PX = 248;

export type SafeArea = { top: number; right: number; bottom: number; left: number };

/**
 * Margins for a viewport: 16 px (24 px on desktop) from the sides, clear of the
 * sidebar on desktop, clear of the bottom tabs (80 px) on phones, plus the
 * device safe area.
 */
export function insetsFor(viewportWidth: number, safeArea: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 }): Insets {
  const desktop = viewportWidth >= DESKTOP_MIN_WIDTH;
  const side = desktop ? 24 : 16;
  return {
    top: 16 + safeArea.top,
    right: side + safeArea.right,
    bottom: (desktop ? 24 : 80) + safeArea.bottom,
    left: (desktop ? SIDEBAR_WIDTH_PX + side : side) + safeArea.left,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** True once the pointer has travelled at least the threshold from where it went down. */
export function exceedsDragThreshold(start: Point, current: Point, threshold = DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

/** Keeps the button's top-left corner so the whole button stays inside the viewport minus the insets. */
export function clampPoint(point: Point, size: Size, viewport: Size, insets: Insets): Point {
  return {
    x: clamp(point.x, insets.left, viewport.width - insets.right - size.width),
    y: clamp(point.y, insets.top, viewport.height - insets.bottom - size.height),
  };
}

/** Left edge of the button when it sits on a side. */
export function xForSide(side: ButtonSide, size: Size, viewport: Size, insets: Insets): number {
  return side === "left" ? insets.left : Math.max(insets.left, viewport.width - insets.right - size.width);
}

/** Top-left corner for a stored position, clamped inside the safe area. */
export function pointForPosition(position: ButtonPosition, size: Size, viewport: Size, insets: Insets): Point {
  const y = clamp(position.y, 0, 1) * viewport.height;
  return clampPoint({ x: xForSide(position.side, size, viewport, insets), y }, size, viewport, insets);
}

/** The nearest side to where the button's centre is when released. */
export function nearestSide(point: Point, size: Size, viewport: Size, insets: Insets): ButtonSide {
  const center = point.x + size.width / 2;
  const mid = (insets.left + (viewport.width - insets.right)) / 2;
  return center < mid ? "left" : "right";
}

/** Position to store when a drag ends at `point`: nearest edge, vertical kept and clamped. */
export function snapPosition(point: Point, size: Size, viewport: Size, insets: Insets): ButtonPosition {
  const clamped = clampPoint(point, size, viewport, insets);
  return {
    side: nearestSide(clamped, size, viewport, insets),
    y: viewport.height > 0 ? clamped.y / viewport.height : DEFAULT_BUTTON_POSITION.y,
  };
}

/** Reads a stored value of any shape; anything unusable falls back to bottom-right. */
export function parsePosition(value: unknown): ButtonPosition {
  if (typeof value !== "object" || value === null) return DEFAULT_BUTTON_POSITION;
  const { side, y } = value as { side?: unknown; y?: unknown };
  if ((side !== "left" && side !== "right") || typeof y !== "number" || !Number.isFinite(y)) {
    return DEFAULT_BUTTON_POSITION;
  }
  return { side, y: clamp(y, 0, 1) };
}

/**
 * Next position for an Alt+Arrow key: left / right switch edges, up / down step
 * 10 % from where the button really is (so a clamped bottom-right steps visibly).
 * Returns null for any other key.
 */
export function positionForKey(
  key: string,
  position: ButtonPosition,
  size: Size,
  viewport: Size,
  insets: Insets,
): ButtonPosition | null {
  const current = pointForPosition(position, size, viewport, insets);
  const y = viewport.height > 0 ? current.y / viewport.height : position.y;
  switch (key) {
    case "ArrowLeft":
      return { side: "left", y };
    case "ArrowRight":
      return { side: "right", y };
    case "ArrowUp":
      return { side: position.side, y: Math.max(0, y - KEY_STEP) };
    case "ArrowDown":
      return { side: position.side, y: Math.min(1, y + KEY_STEP) };
    default:
      return null;
  }
}
