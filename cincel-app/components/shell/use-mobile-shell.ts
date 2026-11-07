"use client";

import { useSyncExternalStore } from "react";

import { MOBILE_MEDIA_QUERY } from "@/lib/ui/mobile-nav";

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(MOBILE_MEDIA_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = mediaQuery();
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // Without matchMedia the CSS breakpoint (`md:hidden`) decides alone.
  return mediaQuery()?.matches ?? true;
}

/**
 * The server render keeps the mobile chrome in the markup (hidden from 768 px
 * by CSS) so phones get it on first paint; after hydration the client drops
 * it on wider screens.
 */
function getServerSnapshot(): boolean {
  return true;
}

/** True below 768 px (redesign FE §3.1): the sidebar is hidden and the mobile shell renders. */
export function useMobileShell(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
