"use client";

import { Children, useCallback, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton, type LoadingSkeletonProps } from "@/components/shell/LoadingSkeleton";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { LIFT_CLASS } from "@/components/widgets/lift";
import { StyleView } from "@/components/widgets/StyleView";
import type { Tone } from "@/lib/types/widgets";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * Card container of the widget library (redesign FE §4.10.1); extends shadcn
 * `Card` (`CardHeader` / `CardAction`).
 *
 * - Visual: card with the theme shadow, tinted icon chip, title and action link;
 *   a card with header actions (a link or button) lifts on hover and focus.
 * - Esencial: the same card without the icon chip and without a shadow (1 px border).
 * - Analítico: table container (radius 10, `muted` header row, no shadow).
 *
 * Widget-level states (FE §4.10.1): `loading` renders the `LoadingSkeleton`
 * variant inside the card; `emptyState` is rendered when the children render nothing.
 *
 * `collapsible` (dashboards, zustand.md §2.5) adds a "Contraer" / "Expandir"
 * toggle to the actions slot; while collapsed the body is not rendered.
 */
export type WidgetCardProps = {
  title: string;
  icon?: LucideIcon;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  /** Shown instead of the body when `children` renders nothing. */
  emptyState?: EmptyStateProps;
  /** Renders the skeleton instead of the body. */
  loading?: boolean;
  /** `LoadingSkeleton` variant used while `loading`; defaults to `"list"`. */
  skeleton?: LoadingSkeletonProps["variant"];
  /** Collapse control: a toggle button in the actions slot; the body is not rendered while collapsed. */
  collapsible?: { collapsed: boolean; onToggle(): void };
  /**
   * Visual: position of the card among a page's sections (Resumen,
   * Proyectos); the card rises in (`rise`) 60 ms after the one before.
   */
  enterIndex?: number;
};

function CollapseToggle({ collapsed, onToggle, bodyId }: NonNullable<WidgetCardProps["collapsible"]> & { bodyId: string }) {
  const label = collapsed ? "Expandir" : "Contraer";
  const Icon = collapsed ? ChevronDown : ChevronUp;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-slot="widget-card-collapse"
      aria-expanded={!collapsed}
      aria-controls={bodyId}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

/** Icon chip tint and ink per tone (FE §14.2, §14.5). */
const TONE_CHIP: Record<Tone, string> = {
  default: "bg-muted text-foreground",
  ok: "bg-success/15 text-success",
  warn: "bg-[color-mix(in_oklab,var(--warning)_22%,var(--card))] text-(--warning-ink)",
  critical: "bg-destructive/10 text-destructive",
};

function hasContent(children: ReactNode): boolean {
  return Children.toArray(children).length > 0;
}

/**
 * Renders `children`, and `emptyState` instead when they render no DOM nodes
 * (e.g. a body component that returns `null`). The wrapper uses
 * `display: contents`, so it does not change the card layout.
 */
function BodyOrEmpty({ children, emptyState }: { children: ReactNode; emptyState: EmptyStateProps }) {
  const [empty, setEmpty] = useState(false);
  const bodyRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const update = () => setEmpty(node.childNodes.length === 0);
    update();
    const observer = new MutationObserver(update);
    observer.observe(node, { childList: true });
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div ref={bodyRef} data-slot="widget-card-body" className="contents">
        {children}
      </div>
      {empty ? <EmptyState {...emptyState} /> : null}
    </>
  );
}

export function WidgetCard({
  title,
  icon: Icon,
  tone = "default",
  actions,
  children,
  padded = true,
  emptyState,
  loading = false,
  skeleton = "list",
  collapsible,
  enterIndex,
}: WidgetCardProps) {
  const titleId = useId();
  const bodyId = useId();
  const collapsed = collapsible?.collapsed ?? false;
  const headerActions = collapsible ? (
    <span className="flex items-center gap-2">
      {actions}
      <CollapseToggle {...collapsible} bodyId={bodyId} />
    </span>
  ) : (
    actions
  );

  const body = (): ReactNode => {
    if (loading) return <LoadingSkeleton variant={skeleton} />;
    if (!emptyState) return children;
    if (!hasContent(children)) return <EmptyState {...emptyState} />;
    return <BodyOrEmpty emptyState={emptyState}>{children}</BodyOrEmpty>;
  };

  const regionProps = {
    role: "region" as const,
    "aria-labelledby": titleId,
    "aria-busy": loading || undefined,
    "data-tone": tone,
  };

  return (
    <StyleView
      visual={() => (
        <Card
          {...regionProps}
          data-style="visual"
          className={cn("shadow-(--shadow-card)", headerActions && LIFT_CLASS, enterIndex !== undefined && "rise")}
          style={enterIndex !== undefined ? staggerStyle(enterIndex, 60) : undefined}
        >
          <CardHeader className="flex items-center gap-3">
            {Icon ? (
              <span
                data-slot="widget-card-icon"
                aria-hidden="true"
                className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_CHIP[tone])}
              >
                <Icon className="size-4" />
              </span>
            ) : null}
            <CardTitle id={titleId} role="heading" aria-level={2} className="min-w-0 flex-1">
              {title}
            </CardTitle>
            {headerActions ? <CardAction className="text-sm">{headerActions}</CardAction> : null}
          </CardHeader>
          {collapsed ? null : (
            <CardContent id={collapsible ? bodyId : undefined} className={cn(!padded && "px-0")}>
              {body()}
            </CardContent>
          )}
        </Card>
      )}
      esencial={() => (
        <Card {...regionProps} data-style="esencial" className="border shadow-none ring-0">
          <CardHeader>
            <CardTitle id={titleId} role="heading" aria-level={2}>
              {title}
            </CardTitle>
            {headerActions ? <CardAction className="text-[13px]">{headerActions}</CardAction> : null}
          </CardHeader>
          {collapsed ? null : (
            <CardContent id={collapsible ? bodyId : undefined} className={cn("text-[15px]", !padded && "px-0")}>
              {body()}
            </CardContent>
          )}
        </Card>
      )}
      analitico={() => (
        <Card {...regionProps} data-style="analitico" className="gap-0 rounded-[10px] border py-0 shadow-none ring-0">
          <CardHeader data-slot="widget-card-header-row" className="items-center border-b bg-muted py-2">
            <CardTitle id={titleId} role="heading" aria-level={2} className="text-[11.5px]">
              {title}
            </CardTitle>
            {headerActions ? <CardAction className="self-center text-[11.5px]">{headerActions}</CardAction> : null}
          </CardHeader>
          {collapsed ? null : (
            <CardContent id={collapsible ? bodyId : undefined} className={cn("text-[12.5px]", padded ? "py-3" : "px-0")}>
              {body()}
            </CardContent>
          )}
        </Card>
      )}
    />
  );
}
