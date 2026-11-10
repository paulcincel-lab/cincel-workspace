"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Distance from the bottom (px) that still counts as "at the bottom". */
export const SCROLL_ANCHOR_THRESHOLD = 80;

export type ScrollAnchor = {
  /** True when the log is within 80 px of its last message. */
  atBottom: boolean;
  /** Messages that arrived while the log was scrolled up (reset on `jump` or when the user scrolls down). */
  newCount: number;
  /** Scrolls the log to the bottom (smooth, instant under reduced motion), resets the count and focuses the log. */
  jump(): void;
};

export type ScrollAnchorOptions = {
  /**
   * The number of messages the log shows (for example, the assistant
   * messages). Growth while scrolled up adds to `newCount`. Without it the
   * hook counts `<article>` elements added inside the log.
   */
  count?: number;
};

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** A bottom-anchored (`column-reverse`) scroller has `scrollTop` 0 at the bottom and negative above it. */
function isReversed(el: HTMLElement): boolean {
  return typeof window !== "undefined" && window.getComputedStyle(el).flexDirection === "column-reverse";
}

/** Pixels between the visible area and the bottom of the content. */
export function distanceFromBottom(el: HTMLElement): number {
  if (isReversed(el)) return Math.abs(el.scrollTop);
  return Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop);
}

/**
 * Bottom anchoring for a chat log (Asistente, every style): whether the
 * reader is at the last message, how many messages arrived while they read
 * older ones, and a jump back to the bottom. Works with a plain scroller and
 * with the `column-reverse` one the Asistente layouts use.
 */
export function useScrollAnchor(ref: RefObject<HTMLElement | null>, options: ScrollAnchorOptions = {}): ScrollAnchor {
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const atBottomRef = useRef(true);
  const { count } = options;
  const lastCount = useRef(count);

  // Scroll position.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const bottom = distanceFromBottom(el) <= SCROLL_ANCHOR_THRESHOLD;
      atBottomRef.current = bottom;
      setAtBottom(bottom);
      if (bottom) setNewCount(0);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [ref]);

  // Messages counted by the caller.
  useEffect(() => {
    if (count === undefined) return;
    const previous = lastCount.current ?? count;
    lastCount.current = count;
    if (count > previous && !atBottomRef.current) setNewCount((n) => n + (count - previous));
  }, [count]);

  // Without a count: `<article>` elements added inside the log.
  useEffect(() => {
    const el = ref.current;
    if (!el || count !== undefined || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver((records) => {
      if (atBottomRef.current) return;
      let added = 0;
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.tagName === "ARTICLE") added += 1;
          added += node.querySelectorAll("article").length;
        });
      }
      if (added > 0) setNewCount((n) => n + added);
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref, count]);

  const jump = useCallback(() => {
    const el = ref.current;
    if (el) {
      const top = isReversed(el) ? 0 : el.scrollHeight;
      const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
      if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior });
      else el.scrollTop = top;
      el.focus({ preventScroll: true });
    }
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
  }, [ref]);

  return { atBottom, newCount, jump };
}
