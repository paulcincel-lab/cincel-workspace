"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  NotebookPenIcon,
  PlusIcon,
  SparklesIcon,
  SquareCheckIcon,
  StickyNoteIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import { searchWorkspaceAction } from "@/lib/actions/search-actions";
import { IMPLEMENTED as SEARCH_IMPLEMENTED } from "@/lib/actions/search-actions.flags";
import { unwrapActionResult } from "@/lib/actions/action-result";
import { clockInAction, fetchMyTodayAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED as TIME_TRACKING_IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { actionErrorText } from "@/lib/errors";
import type { SearchResult, SearchResultType, TodayStatus } from "@/lib/types/redesign";
import { canOpenShellOverlay, openAssistant, registerShellOpener } from "@/lib/ui/shell-openers";

/**
 * ⌘K palette (redesign FE §3.12, frame `BuscarCmdK`): `searchWorkspaceAction`
 * results grouped by type plus the static, client-side "Acciones" group.
 *
 * The palette owns its global ⌘K / Ctrl+K shortcut and registers itself as the
 * "search" shell opener (`openCommandPalette()` in `lib/ui/shell-openers.ts`),
 * so the parent only keeps `open`. Below 2 characters no search call is made.
 */
export type CommandPaletteProps = { open: boolean; onOpenChange(open: boolean): void };

export const SEARCH_DEBOUNCE_MS = 200;
export const SEARCH_MIN_CHARS = 2;

/** Whether the Sidebar search button may show (FE §9: entry points stay hidden while the flag is false). */
export const SEARCH_ENTRY_AVAILABLE: boolean = SEARCH_IMPLEMENTED.searchWorkspaceAction;

/** Group order and headings follow the `BuscarCmdK` frame. */
export const RESULT_GROUPS: readonly { type: SearchResultType; heading: string; icon: LucideIcon }[] = [
  { type: "proyecto", heading: "Proyectos", icon: FolderIcon },
  { type: "tarea", heading: "Tareas", icon: SquareCheckIcon },
  { type: "persona", heading: "Personas", icon: UserIcon },
  { type: "archivo", heading: "Archivos", icon: FileTextIcon },
  { type: "nota", heading: "Notas", icon: StickyNoteIcon },
];

export type PaletteActionId = "crear-tarea" | "nuevo-proyecto" | "nueva-nota" | "preguntar-asistente" | "registrar-entrada";

type PaletteAction = { id: PaletteActionId; label: string; keywords: string[]; icon: LucideIcon };

const ACTIONS: readonly PaletteAction[] = [
  { id: "crear-tarea", label: "Crear tarea", keywords: ["nueva tarea", "pendiente"], icon: PlusIcon },
  { id: "nuevo-proyecto", label: "Nuevo proyecto", keywords: ["crear proyecto", "obra"], icon: FolderPlusIcon },
  { id: "nueva-nota", label: "Nueva nota", keywords: ["crear nota", "apunte"], icon: NotebookPenIcon },
  { id: "preguntar-asistente", label: "Preguntar al asistente", keywords: ["cincel", "ayuda", "chat"], icon: SparklesIcon },
  { id: "registrar-entrada", label: "Registrar entrada", keywords: ["jornada", "horario", "checar"], icon: ClockIcon },
];

const ACTION_URLS: Partial<Record<PaletteActionId, string>> = {
  "crear-tarea": "/tareas?nueva=1",
  "nuevo-proyecto": "/proyectos?nuevo=1",
  "nueva-nota": "/mi-espacio?nota=nueva",
};

/** Lowercase, accents removed, for client-side matching. */
export function normalizeForMatch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** The "Acciones" commands visible for a query and the viewer's state, in display order. */
export function visibleActionIds(
  query: string,
  opts: { canAskAssistant: boolean; canClockIn: boolean },
): PaletteActionId[] {
  const q = normalizeForMatch(query);
  return ACTIONS.filter((action) => {
    if (action.id === "preguntar-asistente" && !opts.canAskAssistant) return false;
    if (action.id === "registrar-entrada" && !opts.canClockIn) return false;
    if (!q) return true;
    return [action.label, ...action.keywords].some((text) => normalizeForMatch(text).includes(q));
  }).map((action) => action.id);
}

/** Results bucketed in `RESULT_GROUPS` order; empty groups are dropped. Order inside a group is the server's. */
export function groupSearchResults(
  results: readonly SearchResult[],
): { type: SearchResultType; heading: string; icon: LucideIcon; items: SearchResult[] }[] {
  return RESULT_GROUPS.map((group) => ({ ...group, items: results.filter((r) => r.type === group.type) })).filter(
    (group) => group.items.length > 0,
  );
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

const CLOCK_TIME = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hourCycle: "h23" });

/** "9:02" (FE §9 toast copy): 24-hour clock, hour without a leading zero on every ICU build. */
function formatClockTime(date: Date): string {
  const parts = CLOCK_TIME.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

type SearchState = { query: string; results: SearchResult[]; error: string | null };

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ query: "", results: [], error: null });
  const [today, setToday] = useState<TodayStatus | null>(null);
  const [clockingIn, setClockingIn] = useState(false);

  const trimmed = query.trim();
  const canSearch = trimmed.length >= SEARCH_MIN_CHARS;
  /** The last response belongs to the current query (no newer call pending). */
  const settled = canSearch && search.query === trimmed;

  // ⌘K / Ctrl+K from any page of the shell, plus the "search" opener for other entry points (404 "Buscar").
  const toggleFromShortcut = useEffectEvent(() => onOpenChange(!open));
  const openFromElsewhere = useEffectEvent(() => onOpenChange(true));
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleFromShortcut();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    const unregister = registerShellOpener("search", () => openFromElsewhere());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unregister();
    };
  }, []);

  // Debounced search; nothing is called below the minimum length. A newer query cancels the pending one.
  useEffect(() => {
    if (!open || !canSearch) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchWorkspaceAction({ query: trimmed })
        .then((results) => {
          if (!cancelled) setSearch({ query: trimmed, results, error: null });
        })
        .catch((err: unknown) => {
          if (!cancelled) setSearch({ query: trimmed, results: [], error: actionErrorText(err, "search") });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, canSearch, trimmed]);

  // "Registrar entrada" depends on the viewer's day; re-read each time the palette opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchMyTodayAction()
      .then((status) => {
        if (!cancelled) setToday(status);
      })
      .catch(() => {
        if (!cancelled) setToday(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const canClockIn = TIME_TRACKING_IMPLEMENTED.clockInAction && today?.enabled === true;
  const actionIds = visibleActionIds(trimmed, {
    canAskAssistant: open && canOpenShellOverlay("assistant"),
    canClockIn,
  });
  const visibleActions = ACTIONS.filter((action) => actionIds.includes(action.id));

  // While a newer query is pending, the previous results stay on screen.
  const shownResults = canSearch ? search.results : [];
  const groups = groupSearchResults(shownResults);
  const searchError = settled ? search.error : null;
  const showNoResults = settled && !searchError && shownResults.length === 0 && visibleActions.length === 0;

  function close() {
    setQuery("");
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  function openResult(result: SearchResult) {
    close();
    if (isExternalUrl(result.url)) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      router.push(result.url);
    }
  }

  async function clockIn() {
    if (clockingIn) return;
    setClockingIn(true);
    try {
      const status = unwrapActionResult(await clockInAction({ source: "sidebar" }));
      setToday(status);
      const at = status.startedAt ? ` ${formatClockTime(new Date(status.startedAt))}` : "";
      toast.success(`Entrada registrada${at}`);
      close();
      router.refresh();
    } catch (err) {
      toast.error(actionErrorText(err));
    } finally {
      setClockingIn(false);
    }
  }

  function runAction(id: PaletteActionId) {
    const url = ACTION_URLS[id];
    if (url) {
      close();
      router.push(url);
      return;
    }
    if (id === "preguntar-asistente") {
      close();
      openAssistant();
      return;
    }
    if (id === "registrar-entrada") void clockIn();
  }

  const resultCount = shownResults.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="top-[15vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[660px]">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <Command shouldFilter={false} loop label="Buscar">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar tareas, proyectos, personas, archivos…"
            aria-label="Buscar"
          />
          {!canSearch && (
            <p data-testid="command-palette-hint" className="px-3 pt-2 text-sm text-muted-foreground">
              Escribe al menos 2 letras.
            </p>
          )}
          {searchError && (
            <p role="alert" className="px-3 pt-2 text-sm text-destructive">
              {searchError}
            </p>
          )}
          <CommandList className="max-h-[min(60vh,420px)]">
            {showNoResults && <CommandEmpty>Sin resultados para “{trimmed}”.</CommandEmpty>}
            {groups.map((group) => (
              <CommandGroup key={group.type} heading={group.heading}>
                {group.items.map((result) => (
                  <CommandItem
                    key={`${result.type}:${result.id}`}
                    value={`${result.type}:${result.id}`}
                    onSelect={() => openResult(result)}
                  >
                    <PaletteIcon icon={group.icon} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{result.title}</span>
                      {result.subtitle && (
                        <span className="truncate text-xs text-muted-foreground">{result.subtitle}</span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {visibleActions.length > 0 && (
              <CommandGroup heading="Acciones">
                {visibleActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={`accion:${action.id}`}
                    disabled={action.id === "registrar-entrada" && clockingIn}
                    onSelect={() => runAction(action.id)}
                  >
                    <PaletteIcon icon={action.icon} />
                    <span className="flex-1 truncate">{action.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div
            data-testid="command-palette-footer"
            className="flex flex-wrap items-center gap-4 border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground"
          >
            <FooterHint keys="↑↓" label="navegar" />
            <FooterHint keys="↵" label="abrir" />
            <FooterHint keys="esc" label="cerrar" />
            {settled && !searchError && (
              <span className="ml-auto" aria-live="polite">
                {resultCount === 1 ? "1 resultado" : `${resultCount} resultados`}
              </span>
            )}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function FooterHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded-sm border bg-background px-1.5 font-mono">{keys}</kbd>
      {label}
    </span>
  );
}
