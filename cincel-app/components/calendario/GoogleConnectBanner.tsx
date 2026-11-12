"use client";

import { CalendarDays } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { bannerCopy, GOOGLE_STATUS_COPY, shouldShowGoogleBanner, type GoogleInfo } from "@/lib/calendario/google-status";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";

import { connectGoogleHref } from "./meeting-format";

/**
 * One-time banner of the page (FE §6.3): "Conecta Google Calendar para ver tus
 * reuniones." with Conectar / Ahora no. "Ahora no" is kept for the session in
 * the store. Without the admin's allowance there is no Conectar.
 */
export function GoogleConnectBanner({ google, returnTo = "/calendario" }: { google: GoogleInfo; returnTo?: string }) {
  const dismissed = useCalendarioUi((s) => s.googleBannerDismissed);
  const dismiss = useCalendarioUi((s) => s.dismissGoogleBanner);
  if (!shouldShowGoogleBanner(google, dismissed)) return null;
  const { text, canConnect } = bannerCopy(google);
  return (
    <Alert className="mb-4 flex flex-wrap items-center gap-2" data-slot="google-connect-banner">
      <CalendarDays aria-hidden />
      <AlertDescription className="min-w-0 flex-1">{text}</AlertDescription>
      <div className="flex gap-2">
        {canConnect ? (
          <a href={connectGoogleHref(returnTo)} className={buttonVariants({ size: "sm" })}>
            {GOOGLE_STATUS_COPY.connect}
          </a>
        ) : null}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {GOOGLE_STATUS_COPY.later}
        </Button>
      </div>
    </Alert>
  );
}
