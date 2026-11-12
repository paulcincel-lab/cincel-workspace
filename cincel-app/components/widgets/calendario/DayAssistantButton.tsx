"use client";

import { useOpenCalendarioAssistant } from "@/components/calendario/use-calendario-assistant-context";
import { Button } from "@/components/ui/shadcn/button";

import { ASK_ASSISTANT_LABEL, ASSISTANT_LABEL } from "./grid-copy";

/** The "Asistente" button at the foot of a day column: opens the panel with that day selected (FE §10). */
export function DayAssistantButton({ date }: { date: string }) {
  const open = useOpenCalendarioAssistant();
  return (
    <Button type="button" variant="outline" size="xs" aria-label={ASK_ASSISTANT_LABEL(date)} onClick={() => open({ selectedDate: date })}>
      ✦ {ASSISTANT_LABEL}
    </Button>
  );
}
