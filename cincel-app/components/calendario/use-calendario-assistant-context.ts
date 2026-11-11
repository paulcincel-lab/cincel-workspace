"use client";

import { useMemo } from "react";

import { useCalendarioQuery } from "@/components/calendario/use-calendario-page";
import { rangeOf } from "@/lib/calendario/range";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { AssistantCalendarContext } from "@/lib/types/calendario";

/** The asistente page context built from the URL and the UI store (BE §6.1). */
export function useCalendarioAssistantContext(): AssistantCalendarContext {
  const query = useCalendarioQuery();
  const selectedDate = useCalendarioUi((s) => s.selectedDate);
  const selectedItemId = useCalendarioUi((s) => s.selectedItemId);
  const proposal = useCalendarioUi((s) => s.proposal);
  return useMemo(() => {
    const { from, to } = rangeOf(query.vista, query.fecha);
    const { mostrar, quien, proyectos, ocultarCompletadas } = query.filters;
    return {
      view: query.vista,
      from,
      to,
      filters: { mostrar, quien, proyectos, ocultarCompletadas },
      ...(selectedDate ? { selectedDate } : {}),
      ...((selectedItemId ?? query.evento) ? { selectedItemId: (selectedItemId ?? query.evento)! } : {}),
      ...((proposal?.id ?? query.propuesta) ? { openProposalId: (proposal?.id ?? query.propuesta)! } : {}),
    };
  }, [query, selectedDate, selectedItemId, proposal]);
}
