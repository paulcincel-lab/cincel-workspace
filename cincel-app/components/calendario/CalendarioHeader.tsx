"use client";

import { useState, type ReactNode } from "react";

import CalendarFeedDialog from "@/components/calendario/CalendarFeedDialog";
import { NewMeetingDialog } from "@/components/calendario/NewMeetingDialog";
import { CALENDARIO_PAGE_COPY as copy } from "@/components/calendario/page-copy";
import { Button } from "@/components/ui/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/shadcn/dropdown-menu";
import { PageHeader } from "@/components/widgets/PageHeader";
import { IMPLEMENTED } from "@/lib/actions/calendario-actions.flags";
import { pluralOverdue, subtitleCounts, subtitleHead } from "@/lib/calendario/labels";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import type { CalKpis, CalendarioQuery } from "@/lib/types/calendario";

/** The subtitle of the header: the range, the counts and the overdue count in `--destructive-ink` (FE §3). */
export function CalendarioSubtitle({ query, today, kpis }: { query: Pick<CalendarioQuery, "vista" | "fecha">; today: string; kpis: CalKpis }): ReactNode {
  return (
    <span data-slot="calendario-subtitle">
      {subtitleHead(query.vista, query.fecha, today)} · {subtitleCounts(kpis)}
      {kpis.overdue > 0 ? (
        <>
          {" · "}
          <span className="text-destructive-ink">{pluralOverdue(kpis.overdue)}</span>
        </>
      ) : null}
    </span>
  );
}

/** Header of /calendario: title, subtitle with counts, "Suscribirse" and "+ Nuevo" (Tarea, Reunión). */
export function CalendarioHeader({ query, today, kpis }: { query: CalendarioQuery; today: string; kpis: CalKpis }): ReactNode {
  const [feedOpen, setFeedOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const openNewTask = useNewTaskUi((s) => s.openNewTask);
  const meetingsReady = IMPLEMENTED.createMeetingAction;

  return (
    <>
      <PageHeader
        title={copy.title}
        description={<CalendarioSubtitle query={query} today={today} kpis={kpis} />}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setFeedOpen(true)}>
              {copy.subscribe}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" size="sm" />}>{copy.newMenu}</DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openNewTask({ deliveryDate: query.fecha }, "calendario")}>{copy.newTask}</DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!meetingsReady}
                  title={meetingsReady ? undefined : copy.newMeetingSoon}
                  onClick={() => setMeetingOpen(true)}
                >
                  {copy.newMeeting}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <CalendarFeedDialog open={feedOpen} onClose={() => setFeedOpen(false)} />
      <NewMeetingDialog open={meetingOpen} onOpenChange={setMeetingOpen} />
    </>
  );
}
