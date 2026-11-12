"use client";

import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { googleStatusOf, GOOGLE_STATUS_COPY, type GoogleInfo } from "@/lib/calendario/google-status";

import { connectGoogleHref } from "./meeting-format";
import type { GoogleRefresh } from "./use-google-refresh";

/**
 * "Google Calendar · sincronizado hace {t}" with its one action (FE §6.3):
 * Conectar / Volver a conectar, Reintentar after a failure, and Actualizar
 * when connected. Used in the Analítico drawer and the toolbar.
 */
export function GoogleStatusLine({
  google,
  refresh,
  returnTo = "/calendario",
  now,
}: {
  google: GoogleInfo;
  refresh: GoogleRefresh;
  returnTo?: string;
  now?: number;
}) {
  const status = googleStatusOf(google, now);
  const failed = refresh.error !== null || status.kind === "failed";
  const text = refresh.error ?? status.text;
  const live = status.kind === "synced" || status.kind === "connected" || status.kind === "failed";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-slot="google-status-line">
      <span className={failed ? "text-destructive" : "text-muted-foreground"} role={failed ? "alert" : "status"}>
        {text}
      </span>
      {status.action === "connect" ? (
        <a href={connectGoogleHref(returnTo)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {GOOGLE_STATUS_COPY.connect}
        </a>
      ) : null}
      {live ? (
        <Button size="sm" variant="outline" disabled={refresh.refreshing} onClick={refresh.refresh}>
          {refresh.refreshing ? GOOGLE_STATUS_COPY.refreshing : failed ? GOOGLE_STATUS_COPY.retry : GOOGLE_STATUS_COPY.refresh}
        </Button>
      ) : null}
    </div>
  );
}
