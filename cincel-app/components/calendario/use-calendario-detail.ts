"use client";

import { useCalendarioQuery } from "./use-calendario-page";

/** The open detail of `?evento=` ("e:<uuid>" or "t:<uuid>"), or null. Phase 1 resolves the item from the range cache. */
export function useCalendarioDetail(): { id: string; kind: "event" | "task"; entityId: string } | null {
  const { evento } = useCalendarioQuery();
  if (!evento) return null;
  return { id: evento, kind: evento.startsWith("e:") ? "event" : "task", entityId: evento.slice(2) };
}
