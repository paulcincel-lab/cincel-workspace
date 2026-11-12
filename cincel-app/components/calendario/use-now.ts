"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs`. A timer for rendering (the
 * now line), not a fetch.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
