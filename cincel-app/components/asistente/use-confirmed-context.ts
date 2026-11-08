"use client";

import { useQuery } from "@tanstack/react-query";

import { asistenteContextOptions, assistantContextIds, hasContextIds } from "@/lib/query/options/asistente";
import type { AssistantContextLabel } from "@/lib/types/asistente";
import type { AssistantContext } from "@/lib/types/redesign";

/** The entity the server confirmed the viewer can see; drives the "Viendo: {entity}" chip. */
export type ConfirmedContext = AssistantContextLabel;

/**
 * The "Viendo:" chip (Query Migration Phase 10, #944): `qk.asistente.context(c)`
 * over the name-only lookup, which returns `{ id, label }` and nothing else.
 * An id the viewer can't see (or that doesn't exist) is null, so no chip is
 * shown for it; a failed lookup shows none either. The most specific id wins
 * on the server: task, then person, then project. Only runs while `enabled`
 * (the sheet is open) and the context names an entity.
 */
export function useConfirmedContext(context: AssistantContext, enabled: boolean): ConfirmedContext | null {
  const ids = assistantContextIds(context);
  const { data } = useQuery({ ...asistenteContextOptions(ids), enabled: enabled && hasContextIds(ids) });
  if (!hasContextIds(ids)) return null;
  return data ?? null;
}
