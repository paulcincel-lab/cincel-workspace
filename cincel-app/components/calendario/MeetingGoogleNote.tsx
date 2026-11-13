"use client";

import { retryMeetingSyncAction } from "@/lib/actions/calendario-actions";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import type { CalEventItem } from "@/lib/types/calendario";

import { MEETING_COPY } from "./meeting-copy";
import { connectGoogleHref, googleStateOf } from "./meeting-format";

/**
 * Google state of a Cincel meeting (FE §6.2): the note and its one action, in
 * the detail of the three Estilos. `variant` only sets the layout: `card`
 * (Visual, inside the floating card), `line` (Esencial, soft line above the
 * primary action), `field` (Analítico, the action under the field list). Only
 * the organizer gets the action. Renders nothing when the meeting is in Google.
 *
 * "Conectar y crear en Google" goes through the grant and returns to the
 * meeting; once the grant exists (`eventsGrant`), the same action runs
 * `retryMeetingSyncAction`. "Reintentar ahora" and "Volver a crear en Google"
 * run it directly. On success the toast reads "Ya está en Google Calendar."
 * and the refetch clears the note.
 */
export function MeetingGoogleNote({
  item,
  eventsGrant,
  variant = "card",
}: {
  item: Pick<CalEventItem, "eventId" | "source" | "syncError" | "canEdit"> & Partial<Pick<CalEventItem, "attendees" | "organizer">>;
  eventsGrant: boolean;
  variant?: "card" | "line" | "field";
}) {
  const retry = useActionMutation<string, CalEventItem>((eventId) => retryMeetingSyncAction(eventId), {
    successToast: MEETING_COPY.retried,
    invalidate: [["calendario", "range"], qk.calendario.meeting(item.eventId)],
  });
  const state = googleStateOf(item);
  if (!state.note) return null;

  const action = state.action;
  const needsGrant = action?.kind === "connect" && !(eventsGrant && item.syncError === "NO_GRANT");
  const wrap =
    variant === "card"
      ? "flex flex-col gap-2 rounded-lg bg-muted p-3 text-sm"
      : variant === "line"
        ? "flex flex-col gap-1.5 text-[12.5px]"
        : "flex flex-col gap-2 pt-2 text-[12.5px]";

  return (
    <div className={wrap} data-slot="meeting-google-note" data-error={item.syncError}>
      <p className="text-muted-foreground">{state.note}</p>
      {action ? (
        needsGrant ? (
          <a
            href={connectGoogleHref(`/calendario?evento=e:${item.eventId}`)}
            className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
          >
            {action.label}
          </a>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={retry.isPending}
            onClick={() => retry.mutate(item.eventId)}
          >
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}
