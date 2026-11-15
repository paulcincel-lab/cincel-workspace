"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, Ref } from "react";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
  exceedsDragThreshold,
  clampPoint,
  insetsFor,
  pointForPosition,
  positionForKey,
  snapPosition,
  type Insets,
  type Point,
  type Size,
} from "@/lib/assistant/button-position";
import { useAssistantPosition } from "@/lib/stores/assistant-position-store";
import { useHasHydrated } from "@/lib/stores/use-has-hydrated";
import { cn } from "@/lib/utils";

export type AssistantButtonProps = {
  onOpen(): void;
  /** Hover or focus: the launcher starts loading the sheet chunk. */
  onIntent?(): void;
  ref?: Ref<HTMLButtonElement>;
};

const FALLBACK_SIZE: Size = { width: 220, height: 48 };

/** Reads the device safe area (notch, home indicator) through a probe element. */
function readSafeArea(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const style = window.getComputedStyle(probe);
  const px = (value: string) => Number.parseFloat(value) || 0;
  const area = {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
  probe.remove();
  return area;
}

type Metrics = { viewport: Size; insets: Insets };

function readMetrics(): Metrics {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  return { viewport, insets: insetsFor(viewport.width, readSafeArea()) };
}

type DragState = {
  pointerId: number;
  start: Point;
  /** Pointer offset inside the button when the press began. */
  grab: Point;
  active: boolean;
};

/**
 * Floating "Pregúntale a Cincel" button with the ⌘J hint (redesign FE §3.1,
 * §4.9). It sits on the left or right edge (bottom-right by default) and can
 * be moved: drag it, or use Alt + arrow keys when focused. A press without
 * movement opens the assistant. The position is remembered per device and
 * re-clamped on resize. Right click (or the context-menu key) offers
 * "Restablecer posición del asistente". The shortcut (⌘J / Ctrl+J) is
 * handled by `AssistantLauncher`.
 */
export function AssistantButton({ onOpen, onIntent, ref }: AssistantButtonProps) {
  const position = useAssistantPosition((s) => s.position);
  const setPosition = useAssistantPosition((s) => s.setPosition);
  const reset = useAssistantPosition((s) => s.reset);
  const hydrated = useHasHydrated(useAssistantPosition);

  const hintId = useId();
  const buttonEl = useRef<HTMLButtonElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [size, setSize] = useState<Size>(FALLBACK_SIZE);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonEl.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Viewport and button size, before the first paint; re-clamp on resize and rotation.
  useLayoutEffect(() => {
    const measure = () => {
      setMetrics(readMetrics());
      const node = buttonEl.current;
      if (node) setSize({ width: node.offsetWidth, height: node.offsetHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const ready = hydrated && metrics !== null;
  const placed: Point | null =
    metrics === null ? null : (dragPoint ?? pointForPosition(position, size, metrics.viewport, metrics.insets));

  const endDrag = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The capture is already gone (cancelled pointer).
    }
    if (!state.active) return;
    // The click that follows the release of a drag must not open the assistant.
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (commit && metrics && dragPoint) {
      setPosition(snapPosition(dragPoint, size, metrics.viewport, metrics.insets));
    }
    setDragPoint(null);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !metrics) return;
    const rect = event.currentTarget.getBoundingClientRect();
    suppressClick.current = false;
    drag.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      grab: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      active: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; the drag still tracks moves on the button.
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId || !metrics) return;
    const current = { x: event.clientX, y: event.clientY };
    if (!state.active) {
      if (!exceedsDragThreshold(state.start, current)) return;
      state.active = true;
      setMenuOpen(false);
    }
    setDragPoint(
      clampPoint({ x: current.x - state.grab.x, y: current.y - state.grab.y }, size, metrics.viewport, metrics.insets),
    );
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || event.metaKey || event.ctrlKey || !metrics) return;
    const next = positionForKey(event.key, position, size, metrics.viewport, metrics.insets);
    if (!next) return;
    event.preventDefault();
    setPosition(next);
  };

  const dragging = dragPoint !== null;

  return (
    <div
      className={cn(
        "fixed z-40 touch-none select-none motion-safe:transition-[left,top] motion-safe:duration-200",
        dragging && "cursor-grabbing motion-safe:transition-none",
        !ready && "invisible",
      )}
      style={{ left: placed?.x ?? 0, top: placed?.y ?? 0 }}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Anchor only: the menu opens from the context-menu event, never from a click. */}
        <DropdownMenuTrigger render={<span aria-hidden className="pointer-events-none absolute inset-0" tabIndex={-1} />} />
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem
            onClick={() => {
              reset();
              setMenuOpen(false);
            }}
          >
            Restablecer posición del asistente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        ref={setButtonRef}
        type="button"
        size="lg"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event, true)}
        onPointerCancel={(event) => endDrag(event, false)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
        onKeyDown={onKeyDown}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        aria-keyshortcuts="Meta+J Control+J"
        aria-describedby={hintId}
        className={cn("h-12 gap-2 rounded-full px-4 shadow-lg", dragging && "cursor-grabbing")}
        data-testid="asistente-boton"
      >
        <SparklesIcon aria-hidden data-icon="inline-start" />
        Pregúntale a Cincel
        <kbd aria-hidden className="rounded-sm border border-primary-foreground/40 px-1.5 font-mono text-xs">
          ⌘J
        </kbd>
      </Button>
      <span id={hintId} className="sr-only">
        Pregúntale a Cincel (⌘J). Arrástralo o usa Alt + flechas para moverlo.
      </span>
    </div>
  );
}
