"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { MAX_DAY_ALERTS, OVERLAP_ACTION_LABEL, OVERLOAD_ACTION_LABEL, type DayAlert } from "@/lib/calendario/alerts";
import { cn } from "@/lib/utils";

export type DayAlertBannerProps = {
  kind: "overload" | "overlap";
  date: string;
  message?: ReactNode;
  /** Button text; defaults to "✦ Reparte esto" / "✦ Resolver traslape". */
  actionLabel?: string;
  /** A proposal for this alert is open or being asked for. */
  pending?: boolean;
  onAction?(): void;
};

/** Banner for an overloaded day or overlapping meetings; its action asks the asistente for a proposal. */
export function DayAlertBanner({ kind, date, message, actionLabel, pending = false, onAction }: DayAlertBannerProps) {
  const label = actionLabel ?? (kind === "overload" ? OVERLOAD_ACTION_LABEL : OVERLAP_ACTION_LABEL);
  return (
    <div
      role="status"
      data-slot="day-alert-banner"
      data-kind={kind}
      data-date={date}
      className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-foreground", kind === "overload" && "border-l-[3px] border-l-destructive")}
    >
      <p className="min-w-0 flex-1">{message}</p>
      {onAction ? (
        <Button type="button" variant="outline" size="sm" onClick={onAction} disabled={pending} aria-busy={pending || undefined}>
          {label}
        </Button>
      ) : null}
    </div>
  );
}

export type DayAlertBannersProps = {
  alerts: readonly DayAlert[];
  /** Key `${kind}:${date}` of the alert whose proposal is open. */
  pendingKey?: string | null;
  onAction?(alert: DayAlert): void;
  className?: string;
};

/** Up to two banners, worst first. */
export function DayAlertBanners({ alerts, pendingKey = null, onAction, className }: DayAlertBannersProps) {
  const shown = alerts.slice(0, MAX_DAY_ALERTS);
  if (shown.length === 0) return null;
  return (
    <div data-slot="day-alert-banners" className={cn("flex flex-col gap-2", className)}>
      {shown.map((alert) => (
        <DayAlertBanner
          key={`${alert.kind}:${alert.date}`}
          kind={alert.kind}
          date={alert.date}
          message={alert.message}
          actionLabel={alert.actionLabel}
          pending={pendingKey === `${alert.kind}:${alert.date}`}
          onAction={onAction ? () => onAction(alert) : undefined}
        />
      ))}
    </div>
  );
}
