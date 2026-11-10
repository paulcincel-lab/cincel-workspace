"use client";

import type { CSSProperties, ReactNode } from "react";
import { ArrowUpIcon, SparklesIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import type { SuggestionTone } from "@/lib/assistant/suggestions";
import { cn } from "@/lib/utils";

/**
 * The three suggestion cards above the Visual composer (frame
 * `Asistente-Visual`) plus "Más ideas". A card's send icon sends its text
 * right away and leaves the draft alone; "Más ideas" opens the starter list.
 */
export type SuggestionCardItem = { text: string; icon: LucideIcon; tone: SuggestionTone };

export type SuggestionCardsProps = {
  items: readonly SuggestionCardItem[];
  onSend(text: string): void;
  onMore(): void;
  /** True while a turn runs: the send icons wait. */
  disabled?: boolean;
};

/** Tile color per tone: the tint token with its ink. */
const TILE_CLASS: Record<SuggestionTone, string> = {
  primary: "bg-tint-primary text-secondary-foreground",
  violet: "bg-tint-violet text-chart-2",
  warning: "bg-tint-warning text-warning",
  cyan: "bg-tint-cyan text-chart-4",
  success: "bg-tint-success text-success",
};

/** `anim-in` steps of .08 s per card. */
function stagger(index: number): CSSProperties {
  return { "--anim-delay": `${index * 80}ms` } as CSSProperties;
}

export function SuggestionCards({ items, onSend, onMore, disabled = false }: SuggestionCardsProps): ReactNode {
  return (
    <div
      role="list"
      aria-label="Sugerencias"
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.text}
            role="listitem"
            style={stagger(index)}
            className={cn(
              "lift anim-in flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card py-2.5 pr-2.5 pl-3",
              index > 0 && "max-sm:hidden",
            )}
          >
            <span
              aria-hidden
              className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", TILE_CLASS[item.tone])}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-[1.35] text-foreground">{item.text}</span>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-[26px] shrink-0 rounded-full"
              aria-label={`Enviar sugerencia: ${item.text}`}
              disabled={disabled}
              onClick={() => onSend(item.text)}
            >
              <ArrowUpIcon aria-hidden className="size-3.5" />
            </Button>
          </div>
        );
      })}
      <div role="listitem" className="flex">
        <button
          type="button"
          onClick={onMore}
          className="inline-flex min-h-full items-center gap-1.5 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--border-strong)_45%,transparent)] bg-transparent px-3.5 text-[12.5px] font-medium whitespace-nowrap text-sidebar-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <SparklesIcon aria-hidden className="size-3.5" />
          Más ideas
        </button>
      </div>
    </div>
  );
}
