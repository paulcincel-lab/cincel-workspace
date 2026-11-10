"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";

import { StatusChip } from "@/components/widgets/StatusChip";
import type { TaskStatusRef } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * Esencial item row (ADR 0005, frames `Lista-Esencial` / `Inicio-Esencial`):
 * optional `leading`, the title, meta items and the status last in a fixed
 * 104 px column. The title is the only tab stop (`<Link>` or `<button>`); a
 * stretched pseudo-element makes the whole row open the item, and `leading`
 * controls sit above it as their own tab stops.
 */
export type EsencialMeta = { key: string; label: string; dot?: string; mono?: boolean; tone?: "muted" | "destructive" };
export type EsencialStatus =
  | { kind: "task"; value: TaskStatusRef }
  | {
      kind: "text";
      label: string;
      tone?: "default" | "destructive" | "warning" | "success" | "muted";
      /** Render as a soft pill (tinted fill, 2 px 8 px, full radius) instead of plain text. */
      chip?: boolean;
    }
  | null;
export type EsencialItemRowProps = {
  title: string;
  href?: string;
  onOpen?(): void;
  meta?: EsencialMeta[];
  status: EsencialStatus;
  leading?: ReactNode;
  layout?: "inline" | "stacked";
  isNew?: boolean;
  muted?: boolean;
};

/** Rows inside `EsencialCard`'s completed disclosure read as muted. */
export const EsencialRowMutedContext = createContext(false);

type TextTone = NonNullable<Extract<EsencialStatus, { kind: "text" }>["tone"]>;

const TEXT_TONE_CLASS: Record<TextTone, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  warning: "text-warning-ink",
  success: "text-success",
  muted: "text-muted-foreground",
};

const CHIP_TONE_CLASS: Record<TextTone, string> = {
  default: "bg-muted",
  destructive: "bg-tint-destructive",
  warning: "bg-tint-warning",
  success: "bg-tint-success",
  muted: "bg-muted",
};

const ROW_CLASS =
  "relative flex items-center gap-3 rounded-md text-sm transition-[background-color] duration-150 hover:bg-accent motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

/** Title classes; the `after:` pseudo-element stretches its hit area over the row. */
const OPENER_CLASS =
  "block min-w-0 truncate text-left font-medium outline-none after:absolute after:inset-0 after:rounded-md focus-visible:outline-none";

function MetaDot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function metaToneClass(item: EsencialMeta): string {
  return item.tone === "destructive" ? "text-destructive" : "text-muted-foreground";
}

function RowStatus({ status }: { status: EsencialStatus }) {
  return (
    <span
      data-slot="esencial-status"
      className="flex min-w-[104px] shrink-0 items-center justify-end text-xs font-medium whitespace-nowrap"
    >
      {status?.kind === "task" ? (
        <StatusChip status={status.value} variant="dot" />
      ) : status?.kind === "text" ? (
        <span
          className={cn(
            TEXT_TONE_CLASS[status.tone ?? "default"],
            status.chip && cn("rounded-full px-2 py-0.5", CHIP_TONE_CLASS[status.tone ?? "default"]),
          )}
        >
          {status.label}
        </span>
      ) : null}
    </span>
  );
}

export function EsencialItemRow({
  title,
  href,
  onOpen,
  meta,
  status,
  leading,
  layout = "inline",
  isNew = false,
  muted,
}: EsencialItemRowProps): ReactNode {
  const inheritedMuted = useContext(EsencialRowMutedContext);
  const isMuted = muted ?? inheritedMuted;
  const items = meta ?? [];
  const ink = isMuted ? "text-muted-foreground" : "text-foreground";

  const opener = href ? (
    <Link href={href} title={title} className={cn(OPENER_CLASS, ink)}>
      {title}
    </Link>
  ) : onOpen ? (
    <button type="button" title={title} onClick={onOpen} className={cn(OPENER_CLASS, ink)}>
      {title}
    </button>
  ) : (
    <span title={title} className={cn("block min-w-0 truncate font-medium", ink)}>
      {title}
    </span>
  );

  const leadingSlot = leading ? (
    <span data-slot="esencial-leading" className="relative z-10 flex shrink-0 items-center">
      {leading}
    </span>
  ) : null;

  if (layout === "stacked") {
    return (
      <div
        data-slot="esencial-row"
        data-layout="stacked"
        data-muted={isMuted ? "" : undefined}
        className={cn(ROW_CLASS, "p-3", isNew && "row-new")}
      >
        {leadingSlot}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {opener}
          {items.length > 0 ? (
            <p className="flex min-w-0 items-center gap-[5px] text-[12.5px] text-muted-foreground">
              {items[0].dot ? <MetaDot color={items[0].dot} /> : null}
              <span className="min-w-0 truncate">
                {items.map((item, i) => (
                  <span key={item.key}>
                    {i > 0 ? " · " : null}
                    <span data-slot="esencial-meta" className={cn(metaToneClass(item), item.mono && "font-mono")}>
                      {item.label}
                    </span>
                  </span>
                ))}
              </span>
            </p>
          ) : null}
        </div>
        <RowStatus status={status} />
      </div>
    );
  }

  return (
    <div
      data-slot="esencial-row"
      data-layout="inline"
      data-muted={isMuted ? "" : undefined}
      className={cn(ROW_CLASS, "px-2.5 py-[9px]", isNew && "row-new")}
    >
      {leadingSlot}
      <span className="flex min-w-0 flex-1">{opener}</span>
      {items.map((item) => (
        <span
          key={item.key}
          data-slot="esencial-meta"
          className={cn(
            "inline-flex shrink-0 items-center gap-[5px] text-xs whitespace-nowrap",
            metaToneClass(item),
            item.mono && "font-mono",
          )}
        >
          {item.dot ? <MetaDot color={item.dot} /> : null}
          {item.label}
        </span>
      ))}
      <RowStatus status={status} />
    </div>
  );
}
