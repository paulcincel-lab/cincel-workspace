"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, Video } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { MEETING_COPY as C } from "@/components/calendario/meeting-copy";
import {
  agoLabel,
  attendeesLabel,
  isReadOnlyMeeting,
  mapsUrl,
  shortDate,
  timeOf,
  whenLabel,
} from "@/components/calendario/meeting-format";
import { MeetingGoogleNote } from "@/components/calendario/MeetingGoogleNote";
import { NewMeetingDialog } from "@/components/calendario/NewMeetingDialog";
import { useMeetingPrep } from "@/components/calendario/use-meeting-prep";
import { useCalendarioQuery, useCalendarioRange } from "@/components/calendario/use-calendario-page";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { ConfirmDeleteDialog } from "@/components/widgets/ConfirmDeleteDialog";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { MeetingMinutesPanel } from "./MeetingMinutesPanel";
import { MeetingPrepPanel } from "./MeetingPrepPanel";
import { cancelMeetingAction } from "@/lib/actions/calendario-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { calendarioInvalidations, meetingDetailOptions, meetingMinutesOptions } from "@/lib/query/options/calendario";
import { openAssistant } from "@/lib/stores/assistant-ui-store";
import { tramoColorVar } from "@/lib/tramos/tramo-color";
import type { CalEventItem, CalTramoRef, MeetingDetail } from "@/lib/types/calendario";

/** The tramo edge colour of a meeting: its slot token, or the neutral one. */
export function tramoEdgeVar(tramo: CalTramoRef | null): string {
  return tramoColorVar(tramo ? { key: tramo.key ?? "", sortOrder: 0, colorSlot: tramo.colorSlot } : null);
}

/** A meeting on the calendar: white card with the tramo edge (FE §4). */
export function MeetingChip({ item, density }: { item: CalEventItem; density: "chip" | "card" | "block" }) {
  const time = item.allDay ? "Todo el día" : timeOf(item.start);
  const place = item.location ?? (item.meetUrl ? "Meet" : null);
  return (
    <span
      data-slot="calendar-item-chip"
      data-kind="event"
      data-density={density}
      style={{ borderLeftColor: tramoEdgeVar(item.tramo) }}
      className={`flex min-w-0 gap-1.5 rounded-md border border-l-[3px] border-border bg-card text-card-foreground ${
        density === "chip" ? "items-center px-1.5 py-0.5 text-xs" : "flex-col px-2 py-1.5 text-sm"
      }`}
    >
      <span className={density === "chip" ? "flex min-w-0 items-center gap-1.5" : "flex min-w-0 flex-col gap-0.5"}>
        {density === "block" ? (
          <span className="truncate font-semibold">{item.title}</span>
        ) : (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{time}</span>
        )}
        {density === "block" ? (
          <span className="font-mono text-xs text-muted-foreground">
            {item.allDay ? time : `${timeOf(item.start)} – ${timeOf(item.end)}`}
          </span>
        ) : (
          <span className="truncate font-medium">{item.title}</span>
        )}
      </span>
      {density !== "chip" && place ? (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {item.location ? <MapPin className="size-3 shrink-0" aria-hidden /> : <Video className="size-3 shrink-0" aria-hidden />}
          <span className="truncate">{place}</span>
        </span>
      ) : null}
      {density === "card" && item.attendees.length > 0 ? (
        <span className="text-xs text-muted-foreground">{attendeesLabel(item)}</span>
      ) : null}
    </span>
  );
}

type Variant = "visual" | "esencial" | "analitico";

/** Meeting actions: cancel (with confirmation) and edit (FE §5, §6.2). Shared by the three details. */
function useMeetingActions(onClose: () => void) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cancel = useActionMutation((id: string) => cancelMeetingAction(id, { notify: true }), {
    invalidate: () => calendarioInvalidations("meetings"),
    successToast: C.cancelled,
  });
  return { editing, setEditing, confirming, setConfirming, cancel, onClose };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-baseline gap-2 text-sm">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function ExternalButton({ href, children, primary, size }: { href: string; children: ReactNode; primary?: boolean; size?: "lg" | "default" }) {
  return (
    <Button variant={primary ? "default" : "outline"} size={size ?? "default"} nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
      {children}
    </Button>
  );
}

function MeetingDetailBody({
  item,
  detail: given,
  variant,
  onClose,
}: {
  item: CalEventItem;
  detail?: MeetingDetail;
  variant: Variant;
  onClose: () => void;
}) {
  const query = useCalendarioQuery();
  const { range } = useCalendarioRange(query);
  const today = range?.today ?? query.fecha;
  const fetched = useQuery({ ...meetingDetailOptions(item.eventId), enabled: !given });
  const detail = given ?? fetched.data ?? undefined;
  const readOnly = isReadOnlyMeeting(item);
  const [nowMs] = useState(() => Date.now());
  const a = useMeetingActions(onClose);
  const [tab, setTab] = useState<"detalle" | "antes" | "despues">("detalle");
  const related = detail?.relatedOverdue ?? [];
  const noteParts = [item.meetUrl ? C.meetReady : null, related.length > 0 ? C.relatedCount(related.length) : null].filter(Boolean);
  const fromGoogle = item.source === "google" || (item.syncedAt !== null && !item.syncError);
  const attendeesText = item.invitesVia === "cincel" || item.source === "cincel" ? C.attendeesCincel(item.attendeeCount) : C.attendeesGoogle(item.attendeeCount);
  const origin = fromGoogle
    ? C.syncedAgo(item.syncedAt ? agoLabel(item.syncedAt, nowMs) : "unos minutos")
    : item.syncError
      ? C.originPending
      : C.originCincel;
  const project = item.project ? `${item.project.name}${item.tramo ? ` · ${item.tramo.name}` : ""}` : item.tramo?.name ?? null;

  const grant = range?.google.eventsGrant ?? false;
  const googleNote = (v: "card" | "line" | "field") => <MeetingGoogleNote item={item} eventsGrant={grant} variant={v} />;

  const joinOrDirections = item.meetUrl ? (
    <ExternalButton href={item.meetUrl} primary size={variant === "esencial" ? "lg" : "default"}>
      {C.joinMeet}
    </ExternalButton>
  ) : item.location ? (
    <ExternalButton href={mapsUrl(item.location)} primary size={variant === "esencial" ? "lg" : "default"}>
      {C.directions}
    </ExternalButton>
  ) : null;

  const prepare = (
    <Button variant="outline" onClick={() => setTab("antes")}>
      {C.prepare}
    </Button>
  );
  const projectLink = item.project ? (
    <Button variant="outline" nativeButton={false} render={<Link href={`/proyectos/${item.project.id}`} />}>
      {C.openProject}
    </Button>
  ) : null;
  const ownerButtons =
    item.canEdit && !readOnly ? (
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => a.setEditing(true)}>
          {C.edit}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => a.setConfirming(true)}>
          {C.cancelMeeting}
        </Button>
      </div>
    ) : null;

  let content: ReactNode;
  if (variant === "analitico") {
    content = (
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2">
          <Field label="FECHA">{shortDate(item.date)}</Field>
          <Field label="HORA">
            <span className="font-mono">{item.allDay ? "Todo el día" : `${timeOf(item.start)} – ${timeOf(item.end)}`}</span>
          </Field>
          <Field label="LUGAR">{item.location ?? "—"}</Field>
          <Field label="PROYECTO">{item.project?.name ?? "—"}</Field>
          <Field label="TRAMO">{item.tramo?.name ?? "—"}</Field>
          <Field label="ASISTENTES">
            <span className="flex flex-wrap items-center gap-2">
              <PeopleStack people={item.attendees.map((p, i) => ({ id: `${i}:${p.name}`, name: p.name }))} label="Asistentes" />
              <span className="text-muted-foreground">{attendeesText}</span>
            </span>
          </Field>
          <Field label="ORIGEN">{origin}</Field>
        </dl>
        {googleNote("field")}
        <Section title={C.related}>
          {related.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {related.map((r) => (
                <li key={r.taskId}>{C.relatedLate(r.title, shortDate(r.date))}</li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={C.history}>
          {(detail?.history ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{C.noHistory}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {detail!.history.map((h) => (
                <li key={h.id}>{h.text}</li>
              ))}
            </ul>
          )}
        </Section>
        <div className="flex flex-wrap gap-2">
          {item.meetUrl ? (
            <ExternalButton href={item.meetUrl} primary>
              {C.joinMeet}
            </ExternalButton>
          ) : null}
          {item.googleHtmlLink ? <ExternalButton href={item.googleHtmlLink}>{C.openInGoogle}</ExternalButton> : null}
          {!readOnly ? (
            <>
              <Button variant="outline" onClick={() => setTab("despues")}>
                {C.createMinutes}
              </Button>
              <Button variant="outline" onClick={() => openAssistant({ prompt: `Resume lo pendiente de la reunión «${item.title}»` })}>
                {C.summarize}
              </Button>
            </>
          ) : null}
        </div>
        {ownerButtons}
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {C.kindChip}
          {item.tramo ? ` · ${item.tramo.name}` : ""}
        </p>
        <p className="flex items-center gap-1.5 text-sm">
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {whenLabel(item, today)}
        </p>
        {project ? <p className="text-sm text-muted-foreground">{project}</p> : null}
        {item.location ? (
          <p className="flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {item.location}
          </p>
        ) : null}
        <p className="flex items-center gap-2 text-sm">
          <PeopleStack people={item.attendees.map((p, i) => ({ id: `${i}:${p.name}`, name: p.name }))} label="Asistentes" />
          <span className="text-muted-foreground">{attendeesText}</span>
        </p>
        {noteParts.length > 0 ? <p className="text-sm text-muted-foreground">{noteParts.join(" ")}</p> : null}
        {googleNote(variant === "esencial" ? "line" : "card")}
        {readOnly ? <p className="text-sm text-muted-foreground">{C.readOnly}</p> : null}
        <div className={variant === "esencial" ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
          {readOnly ? (
            item.googleHtmlLink ? (
              <ExternalButton href={item.googleHtmlLink} primary size={variant === "esencial" ? "lg" : "default"}>
                {C.openInGoogle}
              </ExternalButton>
            ) : null
          ) : (
            <>
              {joinOrDirections}
              {projectLink}
              {prepare}
            </>
          )}
        </div>
        {ownerButtons}
      </div>
    );
  }

  return (
    <>
      {readOnly ? (
        content
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="detalle">{C.tabDetail}</TabsTrigger>
            <TabsTrigger value="antes">{C.tabBefore}</TabsTrigger>
            <TabsTrigger value="despues">{C.tabAfter}</TabsTrigger>
          </TabsList>
          <TabsContent value="detalle">{content}</TabsContent>
          <TabsContent value="antes">
            {tab === "antes" ? <PrepTab item={item} variant={variant} /> : null}
          </TabsContent>
          <TabsContent value="despues">
            {tab === "despues" ? <MinutesTab item={item} /> : null}
          </TabsContent>
        </Tabs>
      )}
      <NewMeetingDialog open={a.editing} onOpenChange={a.setEditing} event={item} />
      <ConfirmDeleteDialog
        open={a.confirming}
        onOpenChange={a.setConfirming}
        title={C.cancelQuestion}
        confirmLabel={C.cancelMeeting}
        pending={a.cancel.isPending}
        onConfirm={() =>
          a.cancel.mutate(item.eventId, {
            onSuccess: () => {
              a.setConfirming(false);
              onClose();
            },
            onError: () => a.setConfirming(false),
          })
        }
      />
    </>
  );
}

function PrepTab({ item, variant }: { item: CalEventItem; variant: Variant }) {
  const { prep, loading, send } = useMeetingPrep(item.eventId);
  return (
    <MeetingPrepPanel
      prep={prep}
      eventId={item.eventId}
      variant={variant}
      loading={loading}
      recipients={item.attendees.map((p) => ({ name: p.name }))}
      onSend={send}
    />
  );
}

function MinutesTab({ item }: { item: CalEventItem }) {
  const { data } = useQuery(meetingMinutesOptions(item.eventId));
  return (
    <MeetingMinutesPanel
      minutes={data ?? null}
      eventId={item.eventId}
      projectId={item.project?.id ?? null}
      projectName={item.project?.name ?? null}
    />
  );
}

type MeetingDetailProps = { item: CalEventItem; detail?: MeetingDetail; onClose(): void };

/** Visual: the floating card of a meeting (`role="dialog"`). */
export function MeetingDetailCard({ item, detail, onClose }: MeetingDetailProps) {
  return (
    <Card role="dialog" aria-label={item.title} data-slot="event-detail" className="w-full max-w-sm shadow-lg" style={{ borderTop: `3px solid ${tramoEdgeVar(item.tramo)}` }}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <CardTitle className="text-base font-semibold">{item.title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={C.closeDetail}>
          {C.closeDetail}
        </Button>
      </CardHeader>
      <CardContent>
        <MeetingDetailBody item={item} detail={detail} variant="visual" onClose={onClose} />
      </CardContent>
    </Card>
  );
}

/** Esencial: bottom sheet with one primary action. */
export function MeetingDetailSheet({ item, detail, onClose }: MeetingDetailProps) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" aria-label={item.title} className="max-h-[85dvh] overflow-y-auto rounded-t-xl p-4">
        <SheetHeader className="p-0">
          <SheetTitle className="text-2xl font-semibold">{item.title}</SheetTitle>
          <SheetDescription className="sr-only">{C.kindChip}</SheetDescription>
        </SheetHeader>
        <MeetingDetailBody item={item} detail={detail} variant="esencial" onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}

/** Analítico: right drawer of 420 px with the field list. */
export function MeetingDetailDrawer({ item, detail, onClose }: MeetingDetailProps) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" aria-label={item.title} className="w-full overflow-y-auto p-4 sm:max-w-[420px]">
        <SheetHeader className="p-0">
          <SheetTitle className="text-lg font-semibold">{item.title}</SheetTitle>
          <SheetDescription className="sr-only">{C.kindChip}</SheetDescription>
        </SheetHeader>
        <MeetingDetailBody item={item} detail={detail} variant="analitico" onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}

