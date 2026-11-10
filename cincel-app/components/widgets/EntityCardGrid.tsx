"use client";

import Link from "next/link";
import { ChevronRight, Shapes } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import type { CSSProperties, ReactNode } from "react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { useStyle } from "@/components/shell/StyleProvider";
import { Badge } from "@/components/ui/shadcn/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/shadcn/card";
import { LIFT_CLASS } from "@/components/widgets/lift";
import { ProgressRing } from "@/components/widgets/ProgressRing";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import { tramoColorSlot, tramoLabel } from "@/lib/tramos/compat";
import type { WorkflowRef } from "@/lib/types/core";
import type { EntityCard, RecordColumn, RecordTableData, Tone, TramoKey } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Card grid in three styles (redesign FE §4.10.1, §15), built on shadcn `Card`.
 *
 * - Visual: cards with a tinted 84 px head (tramo chip + progress ring) when the
 *   item has a tramo, otherwise an icon chip row (`iconName`, lucide); title,
 *   subtitle, badges tinted by tone and a meta row. The ring fills in
 *   (`ring`) and cards with a link lift on hover and focus (`lift`).
 * - Esencial: white bordered cards (no shadow, no tints): title + text meta.
 * - Analítico: `table` when given, otherwise one built from `title`,
 *   `subtitle` and `meta` (plus tramo, avance and badges when the items carry
 *   them), rendered by `RecordTable`.
 *
 * `footer` renders below each card (Visual / Esencial); `minWidth` is the
 * minimum card width of the grid track in px. Widget-level states:
 * `emptyState` when there are no items, `loading` for the `LoadingSkeleton`
 * variant (cards, or table in Analítico).
 *
 * Opt-in `view` (zustand.md §2.5): "table" renders the Analítico table in
 * every style; "chart" renders the cards (Esencial keeps its text cards,
 * Visual and Analítico draw the Visual cards). Without it the style decides.
 */
export type EntityCardGridProps = {
  items: EntityCard[];
  table?: RecordTableData;
  footer?: (item: EntityCard) => ReactNode;
  minWidth?: number;
  emptyState?: EmptyStateProps;
  loading?: boolean;
  /** Cards/table override; without it the presentation style decides. */
  view?: WidgetView;
};

export const ENTITY_GRID_EMPTY_TITLE = "Sin elementos";
export const ENTITY_GRID_DEFAULT_MIN_WIDTH = 300;
export const ENTITY_PROGRESS_LABEL = "Avance";
const NO_VALUE = "—";

const ICON_NAMES = new Set<string>(iconNames);

/** "FolderKanban" / "folder_kanban" / "folder-kanban" → "folder-kanban" when lucide has it, else null. */
export function resolveIconName(name: string | undefined): IconName | null {
  if (!name) return null;
  const kebab = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  return ICON_NAMES.has(kebab) ? (kebab as IconName) : null;
}

/** Rounded, clamped 0–100 progress as every style shows it ("82%"). */
export function formatProgress(progress: number): string {
  return `${Math.max(0, Math.min(100, Math.round(progress)))}%`;
}

function tramoRef(key: TramoKey): WorkflowRef {
  return { id: key, key, name: tramoLabel(key), sortOrder: 0 };
}

/**
 * Tint source of a card: the tramo color (`chart-1..3`) for a known tramo,
 * neutral for an unknown one, `chart-1` for items without a tramo (icon chip).
 * Text on the tint uses the slot's `chart-N-ink` (FE §14.5).
 */
function tintVars(item: EntityCard): CSSProperties {
  const slot = item.tramo ? tramoColorSlot(item.tramo) : 1;
  const vars: Record<string, string> = slot
    ? { "--entity-color": `var(--chart-${slot})`, "--entity-ink": `var(--chart-${slot}-ink)` }
    : { "--entity-color": "var(--muted-foreground)", "--entity-ink": "var(--foreground)" };
  return vars as CSSProperties;
}

/** `chart-N-tint` = `chart-N` mixed into `card` at 14 % (light) / 22 % (dark), FE §14.5. */
const TINT_BG =
  "bg-[color-mix(in_oklab,var(--entity-color)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--entity-color)_22%,var(--card))]";

/** Badge per tone (tints FE §14.5); the label is always shown, so color is never the only cue. */
function ToneBadge({ label, tone }: { label: string; tone: Tone }) {
  if (tone === "critical") return <Badge variant="destructive">{label}</Badge>;
  if (tone === "warn") {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-[color-mix(in_oklab,var(--warning)_22%,var(--card))] text-(--warning-ink)"
      >
        {label}
      </Badge>
    );
  }
  if (tone === "ok") {
    return (
      <Badge variant="outline" className="border-transparent bg-success/15 text-success">
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary">{label}</Badge>;
}

function EntityIcon({ name, className }: { name: string | undefined; className?: string }) {
  const resolved = resolveIconName(name);
  if (!resolved) return <Shapes className={className} aria-hidden="true" />;
  return <DynamicIcon name={resolved} className={className} aria-hidden="true" />;
}

/**
 * 52 px progress ring (SVG, `pathLength` 100, fills in with `ring`): one image
 * labelled "{n} % de avance"; the number is shown in its center.
 */
function EntityProgressRing({ progress }: { progress: number }) {
  return (
    <ProgressRing
      data-slot="entity-progress"
      percent={progress}
      size={52}
      stroke={5}
      color="var(--entity-color)"
      track="var(--card)"
      animated
    >
      <span data-value="progress" className="relative text-[11px] font-medium tabular-nums text-foreground">
        {formatProgress(progress)}
      </span>
    </ProgressRing>
  );
}

/** Title; with `href` a stretched link so the whole card is clickable (the footer stays above it). */
function CardTitleLink({ item, className }: { item: EntityCard; className: string }) {
  if (!item.href) {
    return (
      <span data-value="title" className={className}>
        {item.title}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      data-value="title"
      className={cn(
        className,
        "outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2",
      )}
    >
      {item.title}
    </Link>
  );
}

function Grid({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    <ul
      data-slot="entity-grid"
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minWidth}px), 1fr))` }}
    >
      {children}
    </ul>
  );
}

function CardFooterSlot({ item, footer }: { item: EntityCard; footer?: (item: EntityCard) => ReactNode }) {
  const node = footer?.(item);
  if (node === undefined || node === null || node === false) return null;
  return (
    <CardFooter data-slot="entity-footer" className="relative z-10 mt-auto">
      {node}
    </CardFooter>
  );
}

function VisualCard({ item, footer }: { item: EntityCard; footer?: (item: EntityCard) => ReactNode }) {
  return (
    <Card
      data-item={item.id}
      className={cn("relative w-full gap-3 shadow-sm", item.tramo && "pt-0", item.href && LIFT_CLASS)}
      style={tintVars(item)}
    >
      {item.tramo ? (
        <div data-slot="entity-head" className={cn("flex h-21 items-start justify-between gap-3 px-4 pt-3.5", TINT_BG)}>
          <span className="flex min-w-0 items-center gap-2">
            {item.iconName ? (
              <span
                data-slot="entity-icon"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-(--entity-ink)"
              >
                <EntityIcon name={item.iconName} className="size-4" />
              </span>
            ) : null}
            <TramoBadge tramo={tramoRef(item.tramo)} variant="chip" />
          </span>
          {item.progress !== undefined ? <EntityProgressRing progress={item.progress} /> : null}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4">
          <span
            data-slot="entity-icon"
            className={cn(
              "inline-flex size-9.5 shrink-0 items-center justify-center rounded-[10px] text-(--entity-ink)",
              TINT_BG,
            )}
          >
            <EntityIcon name={item.iconName} className="size-4.5" />
          </span>
          {item.progress !== undefined ? (
            <EntityProgressRing progress={item.progress} />
          ) : item.href ? (
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          ) : null}
        </div>
      )}
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitleLink item={item} className="truncate text-[15px] font-semibold text-foreground" />
          {item.subtitle ? (
            <span data-value="subtitle" className="text-[12.5px] leading-snug text-muted-foreground">
              {item.subtitle}
            </span>
          ) : null}
        </div>
        {item.badges && item.badges.length > 0 ? (
          <div data-slot="entity-badges" className="flex flex-wrap gap-1.5">
            {item.badges.map((badge) => (
              <ToneBadge key={badge.label} label={badge.label} tone={badge.tone} />
            ))}
          </div>
        ) : null}
        {item.meta && item.meta.length > 0 ? (
          <dl
            data-slot="entity-meta"
            className="mt-auto flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground"
          >
            {item.meta.map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5">
                <dt>{m.label}</dt>
                <dd data-value={`meta:${m.label}`} className="font-mono text-foreground">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </CardContent>
      <CardFooterSlot item={item} footer={footer} />
    </Card>
  );
}

function EsencialCard({ item, footer }: { item: EntityCard; footer?: (item: EntityCard) => ReactNode }) {
  const parts: { key: string; node: ReactNode }[] = [];
  if (item.tramo) {
    parts.push({ key: "tramo", node: <TramoBadge tramo={tramoRef(item.tramo)} variant="text" /> });
  }
  if (item.progress !== undefined) {
    parts.push({
      key: "progress",
      node: (
        <>
          {ENTITY_PROGRESS_LABEL} <span data-value="progress">{formatProgress(item.progress)}</span>
        </>
      ),
    });
  }
  for (const m of item.meta ?? []) {
    parts.push({
      key: `meta:${m.label}`,
      node: (
        <>
          {m.label} <span data-value={`meta:${m.label}`}>{m.value}</span>
        </>
      ),
    });
  }
  for (const badge of item.badges ?? []) {
    parts.push({
      key: `badge:${badge.label}`,
      node: (
        <span data-value="badge" className={cn(badge.tone === "critical" && "text-destructive")}>
          {badge.label}
        </span>
      ),
    });
  }

  return (
    <Card data-item={item.id} className="relative w-full gap-3 border shadow-none ring-0">
      <CardContent className="flex flex-col gap-1">
        <CardTitleLink item={item} className="text-[15px] font-normal text-foreground" />
        {item.subtitle ? (
          <span data-value="subtitle" className="text-[13px] text-muted-foreground">
            {item.subtitle}
          </span>
        ) : null}
        {parts.length > 0 ? (
          <p data-slot="entity-meta" className="text-[13px] text-muted-foreground">
            {parts.map((part, index) => (
              <span key={part.key}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                {part.node}
              </span>
            ))}
          </p>
        ) : null}
      </CardContent>
      <CardFooterSlot item={item} footer={footer} />
    </Card>
  );
}

/** Distinct meta labels in first-seen order. */
function metaLabels(items: EntityCard[]): string[] {
  const labels: string[] = [];
  for (const item of items) {
    for (const m of item.meta ?? []) if (!labels.includes(m.label)) labels.push(m.label);
  }
  return labels;
}

/**
 * The Analítico table built from the cards when no `table` is given: Nombre,
 * Detalle (subtitle), Tramo, Avance, one column per meta label, Estado
 * (badges). Columns no item fills are left out.
 */
export function entityTableData(items: EntityCard[]): RecordTableData {
  const columns: RecordColumn[] = [{ key: "title", label: "Nombre" }];
  if (items.some((i) => i.subtitle)) columns.push({ key: "subtitle", label: "Detalle" });
  if (items.some((i) => i.tramo)) columns.push({ key: "tramo", label: "Tramo" });
  if (items.some((i) => i.progress !== undefined)) {
    columns.push({ key: "progress", label: ENTITY_PROGRESS_LABEL, align: "right", mono: true, format: "percent" });
  }
  const labels = metaLabels(items);
  for (const label of labels) columns.push({ key: `meta:${label}`, label });
  if (items.some((i) => i.badges && i.badges.length > 0)) columns.push({ key: "badges", label: "Estado" });

  return {
    columns,
    rows: items.map((item) => {
      const row: Record<string, unknown> = {
        id: item.id,
        title: item.title,
        subtitle: item.subtitle ?? null,
        tramo: item.tramo ?? null,
        progress: item.progress ?? null,
        badges: item.badges && item.badges.length > 0 ? item.badges.map((b) => b.label).join(" · ") : null,
      };
      for (const label of labels) row[`meta:${label}`] = item.meta?.find((m) => m.label === label)?.value ?? null;
      return row;
    }),
  };
}

function AnaliticoTable({ items, table }: { items: EntityCard[]; table?: RecordTableData }) {
  const byId = new Map(items.map((item) => [item.id, item]));

  if (table) {
    // The page's own table; the first column links the row's card when it has an href.
    const firstKey = table.columns[0]?.key;
    const renderCell = (key: string, row: Record<string, unknown>): ReactNode | undefined => {
      if (key !== firstKey) return undefined;
      const item = byId.get(String(row.id));
      if (!item?.href) return undefined;
      return (
        <Link href={item.href} className="text-foreground hover:underline">
          {String(row[key] ?? item.title)}
        </Link>
      );
    };
    return <RecordTable data={table} renderCell={renderCell} density="compacta" />;
  }

  const data = entityTableData(items);
  const renderCell = (key: string, row: Record<string, unknown>): ReactNode | undefined => {
    const item = byId.get(String(row.id));
    if (!item) return undefined;
    switch (key) {
      case "title":
        return item.href ? (
          <Link href={item.href} data-item={item.id} data-value="title" className="text-foreground hover:underline">
            {item.title}
          </Link>
        ) : (
          <span data-item={item.id} data-value="title">
            {item.title}
          </span>
        );
      case "subtitle":
        return (
          <span data-item={item.id} data-value="subtitle">
            {item.subtitle ?? NO_VALUE}
          </span>
        );
      case "tramo":
        return item.tramo ? <TramoBadge tramo={tramoRef(item.tramo)} variant="dot" /> : NO_VALUE;
      case "progress":
        return (
          <span data-item={item.id} data-value="progress" className="block text-right font-mono">
            {item.progress !== undefined ? formatProgress(item.progress) : NO_VALUE}
          </span>
        );
      case "badges":
        if (!item.badges || item.badges.length === 0) return NO_VALUE;
        return (
          <span data-item={item.id} data-value="badges">
            {item.badges.map((badge, index) => (
              <span key={badge.label}>
                {index > 0 ? " · " : null}
                <span data-value="badge" className={cn(badge.tone === "critical" && "text-destructive")}>
                  {badge.label}
                </span>
              </span>
            ))}
          </span>
        );
      default: {
        if (!key.startsWith("meta:")) return undefined;
        const value = item.meta?.find((m) => `meta:${m.label}` === key)?.value;
        return (
          <span data-item={item.id} data-value={key}>
            {value ?? NO_VALUE}
          </span>
        );
      }
    }
  };
  return <RecordTable data={data} renderCell={renderCell} density="compacta" />;
}

export function EntityCardGrid({
  items,
  table,
  footer,
  minWidth = ENTITY_GRID_DEFAULT_MIN_WIDTH,
  emptyState,
  loading = false,
  view,
}: EntityCardGridProps) {
  const { style } = useStyle();
  const showsTable = view === undefined ? style === "analitico" : view === "table";

  const visualGrid = () => (
    <Grid minWidth={minWidth}>
      {items.map((item) => (
        <li key={item.id} className="flex">
          <VisualCard item={item} footer={footer} />
        </li>
      ))}
    </Grid>
  );
  const esencialGrid = () => (
    <Grid minWidth={minWidth}>
      {items.map((item) => (
        <li key={item.id} className="flex">
          <EsencialCard item={item} footer={footer} />
        </li>
      ))}
    </Grid>
  );
  const analiticoTable = () => <AnaliticoTable items={items} table={table} />;

  let body: ReactNode;
  if (loading) {
    body = <LoadingSkeleton variant={showsTable ? "table" : "cards"} />;
  } else if (items.length === 0) {
    body = (
      <div data-slot="entity-empty">
        <EmptyState {...(emptyState ?? { title: ENTITY_GRID_EMPTY_TITLE })} />
      </div>
    );
  } else if (view === "table") {
    body = analiticoTable();
  } else {
    body = (
      <StyleView
        visual={visualGrid}
        esencial={esencialGrid}
        analitico={view === "chart" ? visualGrid : analiticoTable}
      />
    );
  }

  return (
    <div data-slot="entity-card-grid" data-style={style}>
      {body}
    </div>
  );
}
