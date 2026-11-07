"use client";

import { Children, useCallback, useId, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { LoadingSkeleton, type LoadingSkeletonProps } from "@/components/shell/LoadingSkeleton";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { StyleView } from "@/components/widgets/StyleView";
import type { Tone } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Card container of the widget library (redesign FE §4.10.1); extends shadcn
 * `Card` (`CardHeader` / `CardAction`).
 *
 * - Visual: card with the theme shadow, tinted icon chip, title and action link.
 * - Esencial: the same card without the icon chip and without a shadow (1 px border).
 * - Analítico: table container (radius 10, `muted` header row, no shadow).
 *
 * Widget-level states (FE §4.10.1): `loading` renders the `LoadingSkeleton`
 * variant inside the card; `emptyState` is rendered when the children render nothing.
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
};

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
}: WidgetCardProps) {
  const titleId = useId();

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
        <Card {...regionProps} data-style="visual" className="shadow-(--shadow-card)">
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
            {actions ? <CardAction className="text-sm">{actions}</CardAction> : null}
          </CardHeader>
          <CardContent className={cn(!padded && "px-0")}>{body()}</CardContent>
        </Card>
      )}
      esencial={() => (
        <Card {...regionProps} data-style="esencial" className="border shadow-none ring-0">
          <CardHeader>
            <CardTitle id={titleId} role="heading" aria-level={2}>
              {title}
            </CardTitle>
            {actions ? <CardAction className="text-[13px]">{actions}</CardAction> : null}
          </CardHeader>
          <CardContent className={cn("text-[15px]", !padded && "px-0")}>{body()}</CardContent>
        </Card>
      )}
      analitico={() => (
        <Card {...regionProps} data-style="analitico" className="gap-0 rounded-[10px] border py-0 shadow-none ring-0">
          <CardHeader data-slot="widget-card-header-row" className="items-center border-b bg-muted py-2">
            <CardTitle id={titleId} role="heading" aria-level={2} className="text-[11.5px]">
              {title}
            </CardTitle>
            {actions ? <CardAction className="self-center text-[11.5px]">{actions}</CardAction> : null}
          </CardHeader>
          <CardContent className={cn("text-[12.5px]", padded ? "py-3" : "px-0")}>{body()}</CardContent>
        </Card>
      )}
    />
  );
}
