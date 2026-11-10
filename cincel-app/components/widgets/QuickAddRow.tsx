"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Loader2, Plus, Sparkles, User } from "lucide-react";

import { activeWorkflowsInOrder, resolveWorkflowId, suggestedFirst } from "@/components/tareas/new-task-form";
import { newTaskWorkflowsKey, useQuickAddUndo } from "@/components/tareas/quick-add-create";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { AreaBadge } from "@/components/v2/status/AreaBadge";
import { tramoBadgeModel } from "@/components/widgets/TramoBadge";
import { fetchCatalogAssignableStaff, fetchCatalogProjectOptions } from "@/lib/actions/page-data/catalog-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import { STALE, qk } from "@/lib/query/keys";
import { runAction } from "@/lib/query/mutation";
import {
  formatQuickAddDate,
  nextWeekday,
  parseQuickAdd,
  personHandle,
  weekdayOf,
  type ParsedQuickAdd,
  type QuickAddPerson,
  type QuickAddToken,
  type QuickAddTramo,
} from "@/lib/quick-add/parse";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import { openAssistant } from "@/lib/stores/assistant-ui-store";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { useQuickAddRecent } from "@/lib/stores/quick-add-store";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import type { CatalogProjectOption } from "@/lib/types/catalog";
import type { TaskPriority, WorkflowDetail } from "@/lib/types/core";
import { cn } from "@/lib/utils";

/**
 * Smart quick-add (ADR 0005, frames `QuickAdd`, `Main`, `Lista-Esencial`,
 * `Tareas-Visual`): the last line of a list (`row`, inside `GroupedTable`),
 * an Esencial card (`card`) or a kanban column (`column`) is an input;
 * typing there creates a task. `parseQuickAdd` reads `@persona`, `#tramo`,
 * dates and `!prioridad`; chips preview the draft and one suggestion line
 * offers the next step (Tab accepts it). Enter calls `onCreate` (a pending
 * row shows until it settles, then a "Creada" line with "Deshacer"); without
 * a project in context it opens `NewTaskDialog` prefilled; "/" hands the
 * text to the Asistente. Catalogs load on first focus.
 */
export type QuickAddContext = {
  label: string;
  projectId: string | null;
  tramoId?: string | null;
  status?: string;
  assigneeId?: string | null;
  placeholder?: string;
};
export type QuickAddDraft = {
  title: string;
  projectId: string | null;
  tramoId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status?: string;
};
export type QuickAddCreated = { id: string; title: string };
export type QuickAddRowProps = {
  context: QuickAddContext;
  onCreate(draft: QuickAddDraft): Promise<QuickAddCreated>;
  variant: "row" | "card" | "column";
  colSpan?: number;
  disabled?: boolean;
};

/** How long the "Creada" line stays. */
export const QUICK_ADD_DONE_MS = 6000;

export type QuickAddSuggestion = { text: string; action?: { label: string; apply(text: string): string } };

type ProjectChoice = Pick<CatalogProjectOption, "id" | "name" | "currentWorkflowId">;
type LoadedPerson = QuickAddPerson & { openCount: number; overdueCount: number };

const toProjectChoices = (rows: readonly CatalogProjectOption[]): ProjectChoice[] =>
  rows.map((p) => ({ id: p.id, name: p.name, currentWorkflowId: p.currentWorkflowId }));

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const abiertas = (n: number) => `${n} ${n === 1 ? "abierta" : "abiertas"}`;
const vencidas = (n: number) => `${n} ${n === 1 ? "vencida" : "vencidas"}`;

function replaceToken(text: string, token: QuickAddToken, replacement: string): string {
  return `${text.slice(0, token.start)}${replacement}${text.slice(token.end)}`;
}

function appendToken(text: string, token: string): string {
  const base = text.replace(/\s+$/, "");
  return base ? `${base} ${token}` : token;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} o ${names[names.length - 1]}`;
}

/** The tramo's people (the catalog's suggested ones) with their load, least loaded first. */
function loadedPeople(people: readonly QuickAddPerson[]): LoadedPerson[] {
  return people
    .filter(
      (p): p is LoadedPerson => Boolean(p.suggested) && typeof p.openCount === "number" && typeof p.overdueCount === "number",
    )
    .sort((a, b) => a.openCount - b.openCount || a.name.localeCompare(b.name, "es-MX"));
}

/**
 * The suggestion line, first match wins: an ambiguous token, the least-loaded
 * person when nobody is set, a lighter person when the assignee has 2+
 * overdue, a Friday (Monday on Fridays) when there is no date, else ready.
 * Rules 2–3 need the per-person counts, absent without a tramo.
 */
export function quickAddSuggestion(input: {
  parsed: ParsedQuickAdd;
  people: readonly QuickAddPerson[];
  tramos: readonly QuickAddTramo[];
  tramoName: string | null;
  assigneeId: string | null;
  contextHasAssignee: boolean;
  today: string;
}): QuickAddSuggestion {
  const { parsed, people, tramoName, assigneeId, today } = input;

  const ambiguous = parsed.tokens.find((t) => t.status === "ambiguous" && (t.candidates?.length ?? 0) > 1);
  if (ambiguous?.candidates) {
    const [first] = ambiguous.candidates;
    const isPerson = ambiguous.kind === "person";
    const replacement = isPerson
      ? personHandle(people.find((p) => p.id === first.id) ?? { id: first.id, name: first.label }, people)
      : `#${input.tramos.find((t) => t.id === first.id)?.key ?? first.label}`;
    const names = joinNames(ambiguous.candidates.slice(0, 3).map((c) => c.label));
    return {
      text: `${isPerson ? "¿Quién?" : "¿Qué tramo?"} ${names}.`,
      action: { label: `Elegir ${first.label}`, apply: (text) => replaceToken(text, ambiguous, replacement) },
    };
  }

  const load = tramoName ? loadedPeople(people) : [];
  const personToken = [...parsed.tokens].reverse().find((t) => t.kind === "person" && t.status === "resolved");

  if (!personToken && !input.contextHasAssignee && load.length > 0) {
    const x = load[0];
    return {
      text: `${x.name} tiene ${abiertas(x.openCount)} en ${tramoName}. ¿Asignar a ${x.name}?`,
      action: { label: `Asignar a ${firstName(x.name)}`, apply: (text) => appendToken(text, personHandle(x, people)) },
    };
  }

  const assignee = people.find((p) => p.id === assigneeId);
  if (load.length > 0 && assignee && (assignee.overdueCount ?? 0) >= 2) {
    const open = assignee.openCount ?? 0;
    const lighter = load.find((p) => p.id !== assignee.id && p.overdueCount === 0 && p.openCount < open);
    if (lighter) {
      const handle = personHandle(lighter, people);
      return {
        text: `${assignee.name} ya tiene ${abiertas(open)} en ${tramoName} y ${vencidas(assignee.overdueCount ?? 0)}. ${lighter.name} tiene ${lighter.openCount}. ¿Cambiar a ${lighter.name}?`,
        action: {
          label: `Cambiar a ${firstName(lighter.name)}`,
          apply: (text) => (personToken ? replaceToken(text, personToken, handle) : appendToken(text, handle)),
        },
      };
    }
  }

  if (!parsed.dueDate) {
    const day = weekdayOf(today) === 5 ? "lunes" : "viernes";
    const iso = nextWeekday(today, day === "lunes" ? 1 : 5);
    return {
      text: `Sin fecha. ¿Vence el ${day} ${formatQuickAddDate(iso)}?`,
      action: { label: `Vence el ${day}`, apply: (text) => appendToken(text, day) },
    };
  }

  const persona = assignee?.name ?? (assigneeId ? "Responsable" : "Sin asignar");
  return { text: `Lista para crear: ${persona} · vence ${formatQuickAddDate(parsed.dueDate)}. Enter para crear.` };
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="shrink-0 rounded-md border border-b-2 border-border px-1.5 py-px font-mono text-[11px] text-foreground-soft">
      {children}
    </kbd>
  );
}

const PRIORITY_BADGE: Record<TaskPriority, { variant: "destructive" | "warning" | "outline"; label: string }> = {
  alta: { variant: "destructive", label: "Alta" },
  media: { variant: "warning", label: "Media" },
  baja: { variant: "outline", label: "Baja" },
};

export function QuickAddRow(props: QuickAddRowProps): ReactNode {
  if (props.disabled) return null;
  return <QuickAddLine {...props} />;
}

type Pending = { key: number; title: string };

function QuickAddLine({ context, onCreate, variant, colSpan = 1 }: QuickAddRowProps): ReactNode {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [activated, setActivated] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [done, setDone] = useState<QuickAddCreated | null>(null);
  const [announce, setAnnounce] = useState(0);
  const seq = useRef(0);

  const { timeZone } = useGeneralSettings().regional;
  const me = useSessionStore(selectCurrentUser);
  const meId = me?.member.id ?? null;
  const markCreated = useQuickAddRecent((s) => s.markCreated);
  const openNewTask = useNewTaskUi((s) => s.openNewTask);
  const undo = useQuickAddUndo(context.projectId);

  const workflowsQuery = useQuery({
    queryKey: newTaskWorkflowsKey(),
    queryFn: () => runAction(fetchWorkflowsAction, {}),
    staleTime: STALE.catalog,
    enabled: activated,
    select: activeWorkflowsInOrder,
  });
  const projectsQuery = useQuery({
    queryKey: qk.catalog.projectOptions(),
    queryFn: () => runAction(fetchCatalogProjectOptions, {}),
    staleTime: STALE.catalog,
    enabled: activated && Boolean(context.projectId),
    select: toProjectChoices,
  });
  const workflows = useMemo<WorkflowDetail[]>(() => workflowsQuery.data ?? [], [workflowsQuery.data]);
  const tramos = useMemo<QuickAddTramo[]>(() => workflows.map((w) => ({ id: w.id, key: w.key, name: w.name })), [workflows]);
  const project = projectsQuery.data?.find((p) => p.id === context.projectId) ?? null;

  const today = zonedIsoDate(new Date(), timeZone);

  // The tramo never depends on the people, so a first parse without them picks the staff query.
  const tramoParse = parseQuickAdd(text, { today, people: [], tramos, meId });
  const tramoFromContext = !tramoParse.tramoId && context.tramoId != null;
  const tramoId = tramoParse.tramoId ?? context.tramoId ?? resolveWorkflowId(null, workflows, { project });
  const workflow = workflows.find((w) => w.id === tramoId) ?? null;

  const staffQuery = useQuery({
    queryKey: qk.catalog.assignableStaff(tramoId),
    queryFn: () => runAction(fetchCatalogAssignableStaff, { workflowId: tramoId }),
    staleTime: STALE.catalog,
    enabled: activated && workflowsQuery.data !== undefined,
    placeholderData: keepPreviousData,
    select: suggestedFirst,
  });
  const people = useMemo<QuickAddPerson[]>(() => staffQuery.data ?? [], [staffQuery.data]);

  const parsed = parseQuickAdd(text, { today, people, tramos, meId });
  const contextHasAssignee = context.assigneeId !== undefined;
  const assigneeId = parsed.assigneeId ?? (contextHasAssignee ? (context.assigneeId ?? null) : meId);
  const draft: QuickAddDraft = {
    title: parsed.title,
    projectId: context.projectId,
    tramoId,
    assigneeId,
    dueDate: parsed.dueDate ?? null,
    priority: parsed.priority ?? "media",
    ...(context.status !== undefined ? { status: context.status } : {}),
  };

  const slashMode = parsed.slash !== null;
  const hasText = text.trim().length > 0;
  const showPreview = hasText && !slashMode;
  const blocked = parsed.tokens.some((t) => t.status === "ambiguous");
  const tramoModel = workflow ? tramoBadgeModel(workflow) : null;
  const suggestion = showPreview
    ? quickAddSuggestion({
        parsed,
        people,
        tramos,
        tramoName: tramoModel?.label ?? null,
        assigneeId,
        contextHasAssignee,
        today,
      })
    : null;

  // The "Creada" line hides after a while.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), QUICK_ADD_DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  function create() {
    const original = text;
    const key = ++seq.current;
    setPending((list) => [...list, { key, title: draft.title }]);
    setText("");
    setDone(null);
    onCreate(draft)
      .then((created) => {
        markCreated(created.id);
        setDone(created);
      })
      .catch(() => {
        // The error toast comes from the caller's mutation; give the text back.
        setText((current) => (current ? current : original));
      })
      .finally(() => setPending((list) => list.filter((p) => p.key !== key)));
  }

  function submit() {
    if (slashMode) {
      const query = parsed.slash ?? "";
      if (!query) return;
      openAssistant({ prompt: query, context: context.projectId ? { projectId: context.projectId } : {} });
      setText("");
      return;
    }
    if (!draft.title || blocked) {
      if (hasText) setAnnounce((n) => n + 1);
      return;
    }
    if (!context.projectId) {
      openNewTask(
        {
          title: draft.title,
          ...(workflow ? { tramoKey: workflow.key } : {}),
          managerId: draft.assigneeId,
          ...(draft.dueDate ? { deliveryDate: draft.dueDate } : {}),
          priority: draft.priority,
          ...(draft.status ? { status: draft.status } : {}),
        },
        "quick-add",
      );
      setText("");
      return;
    }
    create();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Tab" && !event.shiftKey) {
      const action = suggestion?.action;
      if (!action) return;
      event.preventDefault();
      setText(action.apply(text));
    } else if (event.key === "Escape") {
      if (text) {
        event.preventDefault();
        setText("");
      } else {
        inputRef.current?.blur();
      }
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setText(event.target.value);
    setDone(null);
  }

  async function onUndo(created: QuickAddCreated) {
    setDone(null);
    try {
      await undo(created.id);
    } catch {
      // Shown as a toast by the mutation.
    }
  }

  const chipsId = `${id}-chips`;
  const hintId = `${id}-hint`;
  const label = `Nueva tarea en ${context.label}`;
  const placeholder =
    context.placeholder ??
    (variant === "row"
      ? `Nueva tarea en ${context.label}…  @persona  #tramo  fecha  !prioridad  ·  / asistente`
      : "Escribe para agregar una tarea…");
  const active = focused || hasText;

  const chipClass = cn("anim-in rounded-full", variant === "card" ? "h-[22px] text-[11.5px]" : "h-6 text-xs");
  const personName = people.find((p) => p.id === assigneeId)?.name ?? (assigneeId && assigneeId === meId ? me?.member.name : undefined);
  const personLabel = !assigneeId
    ? "Sin asignar"
    : assigneeId === meId
      ? `@yo · ${firstName(personName ?? "Yo")}`
      : `@${personName ?? "Responsable"}`;
  const priority = PRIORITY_BADGE[draft.priority];

  const chips = showPreview ? (
    <div
      id={chipsId}
      data-slot="quick-add-chips"
      className={cn("flex flex-wrap items-center gap-1.5", variant === "row" ? "pr-3 pb-[9px] pl-[62px]" : "pt-2")}
    >
      {draft.title ? (
        <Badge variant="outline" className={chipClass}>
          Tarea {draft.title}
        </Badge>
      ) : null}
      <Badge variant="secondary" className={chipClass}>
        <User aria-hidden="true" />
        {personLabel}
      </Badge>
      {tramoModel ? (
        <span className="anim-in inline-flex items-center gap-1">
          <AreaBadge name={tramoModel.label} colorSlot={tramoModel.slot} tinted />
          {tramoFromContext ? <span className="text-xs font-normal text-muted-foreground">· del tramo</span> : null}
        </span>
      ) : null}
      {draft.dueDate ? (
        <Badge variant="outline" className={chipClass}>
          <CalendarDays aria-hidden="true" />
          Vence {formatQuickAddDate(draft.dueDate, { weekday: variant === "card" })}
        </Badge>
      ) : null}
      <Badge variant={priority.variant} className={chipClass}>
        {priority.label}
      </Badge>
    </div>
  ) : null;

  const boxMargin = variant === "row" ? "mx-3 ml-10" : "mt-2";
  const hint = (
    <div id={hintId} role="status" aria-live="polite" data-slot="quick-add-hint">
      {slashMode ? (
        <div
          className={cn(
            "anim-in rounded-[10px] bg-tint-primary p-3 text-[12.5px] text-secondary-foreground",
            boxMargin,
            variant === "row" && "mb-3",
          )}
        >
          <p className="font-medium">Pedir al asistente: “{parsed.slash}”</p>
          <p>Enter abre el asistente con este texto.</p>
        </div>
      ) : suggestion ? (
        <div
          key={announce}
          className={cn(
            "anim-in flex items-center gap-2 rounded-[10px] bg-tint-primary px-3 py-2 text-[12.5px] text-secondary-foreground",
            boxMargin,
            variant === "row" && "mb-2.5",
          )}
        >
          <Sparkles aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{suggestion.text}</span>
          {suggestion.action ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (suggestion.action) setText(suggestion.action.apply(text));
                inputRef.current?.focus();
              }}
            >
              {suggestion.action.label}
              <Kbd>Tab</Kbd>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const input = (
    <input
      ref={inputRef}
      type="text"
      value={text}
      aria-label={label}
      aria-describedby={showPreview ? `${chipsId} ${hintId}` : hintId}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      onFocus={() => {
        setActivated(true);
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={cn(
        "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
        variant === "card" ? (active ? "text-sm font-medium" : "text-sm") : "text-[13px]",
      )}
    />
  );

  const pendingItems = pending.map((p) =>
    variant === "row" ? (
      <tr key={`pending-${p.key}`} aria-busy="true" data-slot="quick-add-pending">
        <td colSpan={colSpan} className="border-b border-border px-3 py-1.5 pl-10 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Loader2 aria-hidden="true" className="spin size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{p.title}</span>
          </span>
        </td>
      </tr>
    ) : (
      <div
        key={`pending-${p.key}`}
        aria-busy="true"
        data-slot="quick-add-pending"
        className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-muted-foreground"
      >
        <Loader2 aria-hidden="true" className="spin size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{p.title}</span>
      </div>
    ),
  );

  const doneLine = done ? (
    <div
      role="status"
      data-slot="quick-add-done"
      className="anim-in flex items-center gap-2 rounded-[10px] bg-tint-success px-3 py-2 text-[12.5px] text-success"
    >
      <Check aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Creada: {done.title}</span>
      <Button type="button" variant="ghost" size="xs" onClick={() => void onUndo(done)}>
        Deshacer
      </Button>
    </div>
  ) : null;

  if (variant === "row") {
    return (
      <>
        {pendingItems}
        <tr data-slot="quick-add" data-variant="row">
          <td
            colSpan={colSpan}
            className="border-b border-border p-0 focus-within:bg-tint-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset"
          >
            <label className={cn("flex items-center gap-2 px-3 py-1.5 pl-10", showPreview && "pt-[9px]")}>
              <Plus aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              {input}
              <Kbd>Enter</Kbd>
            </label>
            {chips}
            {hint}
          </td>
        </tr>
        {doneLine ? (
          <tr data-slot="quick-add-done-row">
            <td colSpan={colSpan} className="px-3 py-2">
              {doneLine}
            </td>
          </tr>
        ) : null}
      </>
    );
  }

  return (
    <div data-slot="quick-add" data-variant={variant} className="flex flex-col">
      {pendingItems}
      <div
        className={cn(
          variant === "column" &&
            "rounded-md border border-dashed border-input bg-card/60 px-3 py-2.5 text-[13px] text-muted-foreground focus-within:border-primary",
          variant === "card" &&
            (active
              ? "rounded-md border border-primary px-3 py-2.5 ring-[3px] ring-tint-primary"
              : "rounded-[10px] px-2.5 py-[9px] text-sm text-muted-foreground"),
        )}
      >
        <label className="flex items-center gap-2">
          <Plus aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          {input}
        </label>
        {chips}
        {hint}
      </div>
      {doneLine ? <div className="pt-2">{doneLine}</div> : null}
    </div>
  );
}
