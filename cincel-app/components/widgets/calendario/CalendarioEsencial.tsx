"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Clock } from "lucide-react";

import { EmptyState } from "@/components/shell/EmptyState";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { EsencialItemRow, type EsencialMeta, type EsencialStatus } from "@/components/widgets/EsencialItemRow";
import {
  esencialGroups,
  lineLabel,
  shortDate,
  whenLabel,
  type EsencialGroupKey,
} from "@/lib/calendario/esencial-groups";
import { calendarioHref } from "@/lib/calendario/url-state";
import type { CalItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";
import { ESTILO_PARAM } from "@/lib/ui/style-override";
import { cn } from "@/lib/utils";

export type CalendarioEsencialProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onComplete?(taskId: string): void;
};

export const ESENCIAL_AGENDA_LABEL = "Agenda";
export const ESENCIAL_AGENDA_EMPTY = "Tu agenda está libre.";
export const ESENCIAL_SEE_ALL = "Ver todas";

function tramoColor(item: CalItem): string {
  const slot = item.tramo?.colorSlot;
  return slot ? `var(--chart-${slot})` : "var(--muted-foreground)";
}

/** Tramo ring of a task (one tap completes) or the tinted clock disc of a meeting. */
function Leading({ item, onComplete }: { item: CalItem; onComplete?(taskId: string): void }): ReactNode {
  const color = tramoColor(item);
  if (item.kind === "event") {
    return (
      <span className="flex size-11 items-center justify-center" aria-hidden="true">
        <span
          className="flex size-[26px] items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          <Clock className="size-3.5" />
        </span>
      </span>
    );
  }
  const disabled = item.completed || !item.canEdit || !onComplete;
  return (
    <button
      type="button"
      data-slot="esencial-complete"
      aria-label={item.completed ? `Completada: ${item.title}` : `Completar ${item.title}`}
      disabled={disabled}
      onClick={() => onComplete?.(item.taskId)}
      className="group flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[22px] items-center justify-center rounded-full border-2 text-background transition-colors motion-reduce:transition-none",
          !disabled && "group-hover:bg-accent",
        )}
        style={{ borderColor: color, backgroundColor: item.completed ? color : undefined }}
      >
        {item.completed ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

function AgendaRow({
  item,
  group,
  today,
  onOpen,
  onComplete,
}: {
  item: CalItem;
  group: EsencialGroupKey;
  today: string;
  onOpen?(id: string): void;
  onComplete?(taskId: string): void;
}): ReactNode {
  const overdue = item.kind === "task" && item.overdue && !item.completed;
  const when = whenLabel(item, group, today);
  const meta: EsencialMeta[] = [{ key: "line", label: lineLabel(item) }];
  const status: EsencialStatus = overdue
    ? { kind: "text", label: shortDate(item.date), tone: "destructive", chip: true, mono: true }
    : { kind: "text", label: when, tone: "muted", mono: true };
  return (
    <EsencialItemRow
      layout="stacked"
      title={item.title}
      onOpen={onOpen ? () => onOpen(item.id) : undefined}
      meta={meta}
      status={status}
      muted={item.kind === "task" && item.completed}
      leading={<Leading item={item} onComplete={onComplete} />}
    />
  );
}

function seeAllHref(query: CalendarioQuery): string {
  const href = calendarioHref(query);
  return `${href}${href.includes("?") ? "&" : "?"}${ESTILO_PARAM}=analitico`;
}

/**
 * Esencial layout of /calendario (FE §4.2): one soft card per group (Vencidas,
 * Hoy, Mañana, Esta semana, Resto del mes by vista). The ring completes a task
 * (the page owns the mutation, its toast and Deshacer), the rest of the row
 * opens the detail.
 */
export function CalendarioEsencial({ range, query, onOpen, onComplete }: CalendarioEsencialProps) {
  const groups = esencialGroups(range, query.vista);
  if (groups.length === 0) {
    return (
      <section aria-label={ESENCIAL_AGENDA_LABEL} data-slot="calendario-esencial" className="mx-auto w-full max-w-[720px]">
        <EmptyState icon={CalendarCheck} title={ESENCIAL_AGENDA_EMPTY} />
      </section>
    );
  }
  return (
    <section
      aria-label={ESENCIAL_AGENDA_LABEL}
      data-slot="calendario-esencial"
      className="mx-auto flex w-full max-w-[720px] flex-col gap-4"
    >
      {groups.map((group, index) => (
        <EsencialCard
          key={group.key}
          index={index}
          title={group.title}
          meta={group.sub}
          action={
            group.total > group.items.length ? (
              <Link href={seeAllHref(query)} className={buttonVariants({ variant: "link", size: "sm" }) + " min-h-11"}>
                {ESENCIAL_SEE_ALL}
              </Link>
            ) : undefined
          }
        >
          {group.items.map((item) => (
            <AgendaRow key={item.id} item={item} group={group.key} today={range.today} onOpen={onOpen} onComplete={onComplete} />
          ))}
        </EsencialCard>
      ))}
    </section>
  );
}
