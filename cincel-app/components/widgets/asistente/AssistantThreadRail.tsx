"use client";

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { SearchIcon } from "lucide-react";

import {
  filterAssistantThreads,
  groupAssistantThreads,
  threadStatusLine,
} from "@/lib/assistant/thread-groups";
import type { AssistantThreadSummary } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * The conversations list of the full `/asistente` page. `visual` (frame
 * `Asistente-Visual`): search, Fijadas / Recientes and a status line per
 * row. `esencial` / `analitico`: one plain list, pinned first, no status.
 * Rows are links to `?thread=`; the page switches without a reload
 * (`onSelect`). ↑ / ↓ move between rows.
 */
export type AssistantThreadRailProps = {
  threads: readonly AssistantThreadSummary[];
  /** The open stored thread; null for a new conversation. */
  activeId: string | null;
  onSelect(id: string): void;
  /** Called with the search text as it changes (the rail filters by itself). */
  onSearch?(query: string): void;
  variant: "visual" | "esencial" | "analitico";
  /** The thread whose messages are loading. */
  busyId?: string | null;
  /** Extra class of the `<aside>` (width and visibility per breakpoint). */
  className?: string;
  /** Today, for the time labels (tests). */
  now?: Date;
};

const UNTITLED = "Conversación sin título";

function threadHref(id: string): string {
  return `/asistente?thread=${encodeURIComponent(id)}`;
}

/** ↑ / ↓ / Home / End between the rail's row links. */
function moveFocus(event: KeyboardEvent<HTMLElement>): void {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[data-thread-row]"));
  if (links.length === 0) return;
  const index = links.indexOf(document.activeElement as HTMLAnchorElement);
  let next = index;
  if (event.key === "ArrowDown") next = index < 0 ? 0 : Math.min(links.length - 1, index + 1);
  if (event.key === "ArrowUp") next = index < 0 ? 0 : Math.max(0, index - 1);
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = links.length - 1;
  event.preventDefault();
  links[next]?.focus();
}

export function AssistantThreadRail({
  threads,
  activeId,
  onSelect,
  onSearch,
  variant,
  busyId = null,
  className,
  now,
}: AssistantThreadRailProps): ReactNode {
  const [query, setQuery] = useState("");
  const uid = useId();
  const visual = variant !== "esencial";
  const filtered = useMemo(() => (visual ? filterAssistantThreads(threads, query) : [...threads]), [threads, query, visual]);
  const groups = useMemo(() => groupAssistantThreads(filtered, now ?? new Date(), "pinned"), [filtered, now]);

  const row = (thread: AssistantThreadSummary) => {
    const current = thread.id === activeId;
    const title = thread.title || UNTITLED;
    const status = visual ? threadStatusLine(thread, now) : null;
    const flagged = thread.pendingApprovals > 0 || thread.unread;
    return (
      <li key={thread.id}>
        <a
          href={threadHref(thread.id)}
          data-thread-row=""
          aria-current={current ? "true" : undefined}
          aria-busy={busyId === thread.id || undefined}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            onSelect(thread.id);
          }}
          className={cn(
            "flex min-w-0 items-start gap-2.5 rounded-xl border border-transparent outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            visual ? "px-3 py-2.5" : "px-2.5 py-2",
            current
              ? "border-primary/30 bg-card shadow-[0_1px_2px_rgba(15,23,42,.05)]"
              : "hover:bg-accent",
          )}
        >
          {visual ? (
            <span
              aria-hidden
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", flagged ? "bg-primary" : "bg-transparent")}
            />
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cn(
                "truncate text-[13.5px]",
                visual
                  ? flagged || current
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground"
                  : current
                    ? "font-medium text-foreground"
                    : "font-normal text-muted-foreground",
              )}
            >
              {title}
            </span>
            {status ? (
              <span className={cn("truncate text-xs", status.tone === "warning" ? "text-warning" : "text-muted-foreground")}>
                {status.text}
              </span>
            ) : null}
          </span>
        </a>
      </li>
    );
  };

  return (
    <aside
      aria-label="Conversaciones"
      className={cn("flex min-h-0 shrink-0 flex-col gap-1 overflow-y-auto", visual ? "w-62" : "w-55", className)}
    >
      {visual ? (
        <div className="relative mb-1 shrink-0">
          <label htmlFor={`${uid}-buscar`} className="sr-only">
            Buscar conversaciones
          </label>
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={`${uid}-buscar`}
            type="search"
            value={query}
            placeholder="Buscar conversaciones"
            onChange={(event) => {
              setQuery(event.target.value);
              onSearch?.(event.target.value);
            }}
            className="h-9 w-full rounded-[10px] border border-border bg-card pr-3 pl-8 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      ) : null}

      <nav aria-label="Lista de conversaciones" onKeyDown={moveFocus} className="flex flex-col gap-1">
        {threads.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-muted-foreground">Aún no hay conversaciones.</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-muted-foreground">Sin conversaciones con ese texto.</p>
        ) : visual ? (
          groups.map((group) => (
            <section key={group.key} aria-labelledby={`${uid}-${group.key}`} className="flex flex-col gap-1">
              <h2
                id={`${uid}-${group.key}`}
                className="px-2 pt-2 pb-1 font-mono text-[11px] font-normal tracking-[.08em] text-muted-foreground uppercase"
              >
                {group.label}
              </h2>
              <ul className="flex flex-col gap-1">{group.threads.map(row)}</ul>
            </section>
          ))
        ) : (
          <ul className="flex flex-col gap-0.5">{groups.flatMap((group) => group.threads).map(row)}</ul>
        )}
      </nav>
    </aside>
  );
}
