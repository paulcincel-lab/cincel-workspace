"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { sendAgendaAction } from "@/lib/actions/calendario-actions";
import { meetingPrepOptions } from "@/lib/query/options/calendario";
import type { MeetingPrep } from "@/lib/types/calendario";

/** Prep data of a meeting (`qk.calendario.prep`) and the send handler of the "Antes" tab. */
export function useMeetingPrep(eventId: string): { prep: MeetingPrep | null; loading: boolean; send(items: string[]): Promise<boolean> } {
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
  return { prep: data ?? null, loading: isPending, send };
}
