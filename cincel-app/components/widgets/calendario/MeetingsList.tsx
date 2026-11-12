"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { StyleView } from "@/components/widgets/StyleView";
import type { CalEventItem } from "@/lib/types/calendario";

export type MeetingsListProps = {
  meetings: CalEventItem[];
  onOpen?(id: string): void;
  /** "YYYY-MM-DD" in the organization's time; defaults to the local day. */
  today?: string;
};

export type MeetingChip = { key: "hoy" | "proxima" | "minuta-lista" | "sin-minuta"; label: string; variant: "default" | "secondary" | "success" | "outline" };

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** State chips of a meeting (BE §8.3): Hoy, Próxima, Minuta lista, Sin minuta (past without one). */
export function meetingChips(meeting: Pick<CalEventItem, "date" | "minutes">, today: string): MeetingChip[] {
  const chips: MeetingChip[] = [];
  if (meeting.date === today) chips.push({ key: "hoy", label: "Hoy", variant: "default" });
  else if (meeting.date > today) chips.push({ key: "proxima", label: "Próxima", variant: "secondary" });
  if (meeting.minutes === "lista" || meeting.minutes === "enviada") {
    chips.push({ key: "minuta-lista", label: "Minuta lista", variant: "success" });
  } else if (meeting.date < today) {
    chips.push({ key: "sin-minuta", label: "Sin minuta", variant: "outline" });
  }
  return chips;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d))).replace(".", "");
}

function timeLabel(meeting: CalEventItem): string {
  if (meeting.allDay) return "Todo el día";
  const match = meeting.start.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function Chips({ meeting, today }: { meeting: CalEventItem; today: string }) {
  const chips = meetingChips(meeting, today);
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chips.map((chip) => (
        <Badge key={chip.key} variant={chip.variant}>
          {chip.label}
        </Badge>
      ))}
    </span>
  );
}

function OpenButton({ meeting, onOpen }: { meeting: CalEventItem; onOpen?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(meeting.id)}
      className="min-w-0 truncate text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {meeting.title}
    </button>
  );
}

const EMPTY_TEXT = "No hay reuniones en este periodo.";

function MeetingRows({ meetings, onOpen, today }: { meetings: CalEventItem[]; onOpen?: (id: string) => void; today: string }) {
  if (meetings.length === 0) return <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {meetings.map((meeting) => (
        <li key={meeting.id} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-muted-foreground tabular-nums">{dateLabel(meeting.date)}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <OpenButton meeting={meeting} onOpen={onOpen} />
            <span className="truncate text-xs text-muted-foreground">
              {[timeLabel(meeting), meeting.project?.name].filter(Boolean).join(" · ")}
            </span>
          </span>
          <Chips meeting={meeting} today={today} />
        </li>
      ))}
    </ul>
  );
}

/** The Reuniones list with state chips: a table in Analítico, a card in Visual and Esencial. */
export function MeetingsList({ meetings, onOpen, today }: MeetingsListProps) {
  const now = today ?? localToday();
  return (
    <StyleView
      visual={() => (
        <section aria-label="Reuniones">
          <Card>
            <CardHeader>
              <CardTitle>Reuniones</CardTitle>
            </CardHeader>
            <CardContent>
              <MeetingRows meetings={meetings} onOpen={onOpen} today={now} />
            </CardContent>
          </Card>
        </section>
      )}
      esencial={() => (
        <section aria-label="Reuniones">
          <EsencialCard title="Reuniones" headingLevel={2}>
            <MeetingRows meetings={meetings} onOpen={onOpen} today={now} />
          </EsencialCard>
        </section>
      )}
      analitico={() => (
        <section aria-label="Reuniones">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Reunión</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    {EMPTY_TEXT}
                  </TableCell>
                </TableRow>
              ) : (
                meetings.map((meeting) => (
                  <TableRow key={meeting.id}>
                    <TableCell className="tabular-nums">{dateLabel(meeting.date)}</TableCell>
                    <TableCell>
                      <OpenButton meeting={meeting} onOpen={onOpen} />
                    </TableCell>
                    <TableCell>{meeting.project?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Chips meeting={meeting} today={now} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      )}
    />
  );
}
