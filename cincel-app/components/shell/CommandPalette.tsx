"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { IMPLEMENTED as TIME_TRACKING_IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { STALE, qk } from "@/lib/query/keys";
import { mutationErrorText } from "@/lib/query/mutation";
import { meTodayOptions } from "@/lib/query/options/me";
import { openAssistant, useAssistantUi } from "@/lib/stores/assistant-ui-store";
import { useShellUi } from "@/lib/stores/shell-ui-store";
import type { SearchResult, SearchResultType } from "@/lib/types/redesign";

import { useClockMutation } from "./use-clock-mutation";

/**
 * ⌘K palette (redesign FE §3.12, frame `BuscarCmdK`): `searchWorkspaceAction`
 * results grouped by type plus the static, client-side "Acciones" group.
 *
 * Open state lives in `useShellUi` (zustand.md §2.1): the palette owns the
 * global ⌘K / Ctrl+K shortcut (`toggleSearch`) and reports itself mounted
 * (`setSearchAvailable`); the Sidebar button and the 404 "Buscar" button call
 * `openSearch`. Data comes from the query cache:
 *
 * - results: `useQuery(qk.search(q))`, debounced input, previous results kept
 *   while the next ones load; below 2 characters no search call is made.
 * - "Registrar entrada": `useQuery(qk.me.today())`; the clock-in writes its
 *   result into that entry (`useClockMutation`), no router refresh.
 * - "Preguntar al asistente": shown while `useAssistantUi.available` (the
 *   launcher is active on this route, so never on /asistente); opens the sheet.
 */

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

const CLOCK_TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hourCycle: "h23" };

/** "9:02" (FE §9 toast copy): 24-hour clock, hour without a leading zero on every ICU build. */
function formatClockTime(date: Date): string {
  const parts = cachedDateTimeFormat("es-MX", CLOCK_TIME_OPTIONS).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** `value`, once it has stayed the same for `delay` ms. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Search results for `q` (`qk.search(q)`); runs only while `enabled`. */
function useWorkspaceSearch(q: string, enabled: boolean) {
  return useQuery<SearchResult[]>({
    queryKey: qk.search(q),
    queryFn: () => searchWorkspaceAction({ query: q }),
    enabled,
    staleTime: STALE.search,
    placeholderData: keepPreviousData,
  });
}

export function CommandPalette() {
  const router = useRouter();
  const open = useShellUi((s) => s.searchOpen);
  const setSearchOpen = useShellUi((s) => s.setSearchOpen);
  const toggleSearch = useShellUi((s) => s.toggleSearch);
  const setSearchAvailable = useShellUi((s) => s.setSearchAvailable);
  const assistantAvailable = useAssistantUi((s) => s.available);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const canSearch = trimmed.length >= SEARCH_MIN_CHARS;
  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);
  const search = useWorkspaceSearch(debounced, open && canSearch && debounced.length >= SEARCH_MIN_CHARS);
  /** The shown response belongs to the current query (no newer call pending). */
  const settled =
    canSearch && debounced === trimmed && !search.isPlaceholderData && (search.isSuccess || search.isError);

  // "Registrar entrada" depends on the viewer's day: the hydrated `me.today` entry.
  const { data: today } = useQuery({ ...meTodayOptions(), enabled: open });
  const clockInMutation = useClockMutation({ source: "sidebar" });
  const clockingIn = clockInMutation.isPending;

  // ⌘K / Ctrl+K from any page of the shell; the palette reports itself mounted.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleSearch();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    setSearchAvailable(true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      setSearchAvailable(false);
    };
  }, [toggleSearch, setSearchAvailable]);

  const canClockIn = TIME_TRACKING_IMPLEMENTED.clockInAction && today?.enabled === true;
  const actionIds = visibleActionIds(trimmed, {
    canAskAssistant: open && assistantAvailable,
    canClockIn,
  });
  const visibleActions = ACTIONS.filter((action) => actionIds.includes(action.id));

  // While a newer query is pending, the previous results stay on screen.
  const shownResults = canSearch ? (search.data ?? []) : [];
  const groups = groupSearchResults(shownResults);
  const searchError = settled && search.isError ? mutationErrorText(search.error, "search") : null;
  const showNoResults = settled && !searchError && shownResults.length === 0 && visibleActions.length === 0;

  function close() {
    setQuery("");
    setSearchOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    setSearchOpen(next);
  }

  function openResult(result: SearchResult) {
    close();
    if (isExternalUrl(result.url)) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      router.push(result.url);
    }
  }

  function clockIn() {
    if (clockingIn) return;
    clockInMutation.mutate("clockIn", {
      onSuccess: (status) => {
        const at = status.startedAt ? ` ${formatClockTime(new Date(status.startedAt))}` : "";
        toast.success(`Entrada registrada${at}`);
        close();
      },
      onError: (err) => {
        toast.error(mutationErrorText(err));
      },
    });
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
    if (id === "registrar-entrada") clockIn();
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
