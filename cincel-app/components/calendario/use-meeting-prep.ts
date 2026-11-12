"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { rewritePrepSummaryAction, sendAgendaAction } from "@/lib/actions/calendario-actions";
import { meetingPrepOptions } from "@/lib/query/options/calendario";
import type { MeetingPrep } from "@/lib/types/calendario";

export type PrepRewriteResult = { ok: true; text: string } | { ok: false; error: string };

/** Prep data of a meeting (`qk.calendario.prep`) and the send handler of the "Antes" tab. */
export function useMeetingPrep(eventId: string): { prep: MeetingPrep | null; loading: boolean; send(items: string[]): Promise<boolean>; rewrite(): Promise<PrepRewriteResult> } {
  const { data, isPending } = useQuery(meetingPrepOptions(eventId));
  const send = useCallback(
    async (items: string[]) => {
      const result = await sendAgendaAction(eventId, items);
      if (!result.ok) {
        toast.error(result.error ?? "No pude enviar el orden del día.");
        return false;
      }
      toast.success(`Envié el orden del día a ${result.data.sent} ${result.data.sent === 1 ? "persona" : "personas"}.`);
      return true;
    },
    [eventId],
  );
  const rewrite = useCallback(async (): Promise<PrepRewriteResult> => {
    try {
      const result = await rewritePrepSummaryAction(eventId);
      if (!result.ok) return { ok: false, error: result.error ?? "No pude reescribir el resumen." };
      return { ok: true, text: result.data.summary };
    } catch {
      return { ok: false, error: "No pude reescribir el resumen." };
    }
  }, [eventId]);
  return { prep: data ?? null, loading: isPending, send, rewrite };
}
