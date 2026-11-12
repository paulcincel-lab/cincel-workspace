"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { googleStatusOf, GOOGLE_STATUS_COPY } from "@/lib/calendario/google-status";
import { googleCalendarSyncStatusOptions } from "@/lib/query/options/calendar";

import { connectGoogleHref, agoLabel } from "./meeting-format";
import { useGoogleRefresh } from "./use-google-refresh";

/**
 * Ajustes › Integraciones row "Reuniones y disponibilidad" (FE §6.3): Conectar,
 * or "Conectado · sincronizado hace {t}" with Actualizar. When the admin has
 * not allowed the scopes it shows their copy and no Conectar. The status is
 * `googleCalendarSyncStatusOptions`; Actualizar refreshes with `force`.
 */
export function GoogleMeetingsRow() {
  const { data } = useQuery(googleCalendarSyncStatusOptions());
  const google = {
    connected: Boolean(data?.connectedEmail),
    eventsGrant: Boolean(data?.eventsGrant),
    syncedAt: data?.eventsSyncedAt ?? null,
    error: data?.eventsError ?? null,
  };
  // The row never refreshes by itself: it only shows the state and offers Actualizar.
  const refresh = useGoogleRefresh({ ...google, connected: false });
  const [nowMs] = useState(() => Date.now());
  if (!data?.oauthAvailable) return null;

  const status = googleStatusOf(google);
  const live = status.kind === "synced" || status.kind === "connected" || status.kind === "failed";
  const failed = refresh.error !== null || status.kind === "failed";
  const text =
    refresh.error ??
    (status.kind === "synced" || status.kind === "connected"
      ? GOOGLE_STATUS_COPY.rowConnected(google.syncedAt ? agoLabel(google.syncedAt, nowMs) : null)
      : status.text);

  return (
    <div className="flex flex-col gap-2 text-sm" data-slot="google-meetings-row">
      <h3 className="font-medium">{GOOGLE_STATUS_COPY.rowTitle}</h3>
      <p className="text-[12.5px] text-muted-foreground">{GOOGLE_STATUS_COPY.rowDescription}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className={failed ? "text-destructive" : "text-muted-foreground"} role={failed ? "alert" : "status"}>
          {text}
        </span>
        {status.action === "connect" ? (
          <a href={connectGoogleHref("/ajustes/integraciones")} className={buttonVariants()}>
            {GOOGLE_STATUS_COPY.connect}
          </a>
        ) : null}
        {live ? (
          <Button variant="outline" disabled={refresh.refreshing} onClick={refresh.refresh}>
            {refresh.refreshing ? GOOGLE_STATUS_COPY.refreshing : failed ? GOOGLE_STATUS_COPY.retry : GOOGLE_STATUS_COPY.refresh}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
