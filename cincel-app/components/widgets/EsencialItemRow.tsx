"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { StatusChip } from "@/components/widgets/StatusChip";
import type { TaskStatusRef } from "@/lib/types/redesign";

/**
 * Esencial item row (ADR 0005): title, meta text and the status last.
 * Minimal markup for now. Full behavior in #983.
 */
export type EsencialMeta = { key: string; label: string; dot?: string; mono?: boolean; tone?: "muted" | "destructive" };
export type EsencialStatus =
  | { kind: "task"; value: TaskStatusRef }
  | { kind: "text"; label: string; tone?: "default" | "destructive" | "warning" | "success" | "muted" }
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

export function EsencialItemRow({ title, href, onOpen, meta, status, leading }: EsencialItemRowProps): ReactNode {
  const metaText = (meta ?? []).map((m) => m.label).join(" · ");
  return (
    <div>
      {leading}
      {href ? (
        <Link href={href}>{title}</Link>
      ) : onOpen ? (
        <button type="button" onClick={onOpen}>
          {title}
        </button>
      ) : (
        <span>{title}</span>
      )}
      {metaText ? <span>{metaText}</span> : null}
      {status?.kind === "text" ? <span>{status.label}</span> : <StatusChip status={status?.value ?? null} />}
    </div>
  );
}
