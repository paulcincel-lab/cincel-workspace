"use client";

import { Children, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { EsencialRowMutedContext } from "@/components/widgets/EsencialItemRow";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * Esencial soft card (ADR 0005, frames `Lista-Esencial` padding `md`,
 * `Inicio-Esencial` padding `lg`): title (a link with `href`), meta and action
 * in the head, the rows bleeding 10 px past the text, and an optional
 * "N completadas" disclosure whose rows render muted. No loading state:
 * callers render `LoadingSkeleton variant="cards"` or `ErrorState` instead.
 */
export type EsencialCardProps = {
  title: string;
  href?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** `onOpenChange` lets a caller load the closed rows on the first expand. */
  completed?: { count: number; children: ReactNode; onOpenChange?(open: boolean): void };
  padding?: "md" | "lg";
  headingLevel?: 2 | 3;
  index?: number;
};

export const ESENCIAL_CARD_EMPTY_TEXT = "Nada pendiente aquí.";

const PADDING_CLASS: Record<NonNullable<EsencialCardProps["padding"]>, string> = {
  md: "px-5 pt-[18px] pb-3.5",
  lg: "gap-3.5 px-6 py-[22px]",
};

/** "1 completada" / "N completadas". */
export function completedLabel(count: number): string {
  return count === 1 ? "1 completada" : `${count} completadas`;
}

export function EsencialCard({
  title,
  href,
  meta,
  action,
  children,
  completed,
  padding = "md",
  headingLevel = 2,
  index,
}: EsencialCardProps): ReactNode {
  const titleId = useId();
  const completedId = useId();
  const [open, setOpen] = useState(false);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const isEmpty = Children.toArray(children).length === 0;
  const animated = index !== undefined;

  return (
    <section
      aria-labelledby={titleId}
      data-slot="esencial-card"
      data-padding={padding}
      className={cn(
        "flex flex-col rounded-lg border bg-card text-card-foreground shadow-[var(--shadow-card)]",
        PADDING_CLASS[padding],
        animated && "anim-in",
      )}
      style={animated ? staggerStyle(index, 40) : undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2">
        <Heading id={titleId} className="min-w-0 text-base font-semibold break-words">
          {href ? (
            <Link href={href} className="text-foreground transition-colors hover:text-primary motion-reduce:transition-none">
              {title}
            </Link>
          ) : (
            title
          )}
        </Heading>
        {meta || action ? (
          <div className="flex items-baseline gap-3">
            {meta ? (
              <span data-slot="esencial-card-meta" className="text-[12.5px] text-muted-foreground">
                {meta}
              </span>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground">{ESENCIAL_CARD_EMPTY_TEXT}</p>
      ) : (
        <div data-slot="esencial-card-body" className="-mx-2.5 flex flex-col">
          {children}
        </div>
      )}

      {completed && completed.count > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={completedId}
            onClick={() => {
              const next = !open;
              setOpen(next);
              completed.onOpenChange?.(next);
            }}
            className="mt-1 flex items-center gap-1.5 self-start rounded-sm py-1.5 text-left text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown aria-hidden="true" className="chev size-3.5 shrink-0" />
            {completedLabel(completed.count)}
          </button>
          <div
            id={completedId}
            hidden={!open}
            data-slot="esencial-card-completed"
            className={cn("-mx-2.5 flex-col", open ? "flex" : "hidden")}
          >
            <EsencialRowMutedContext.Provider value>{completed.children}</EsencialRowMutedContext.Provider>
          </div>
        </>
      ) : null}
    </section>
  );
}
