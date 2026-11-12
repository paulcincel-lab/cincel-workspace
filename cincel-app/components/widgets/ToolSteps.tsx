"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { UIMessage } from "ai";
import { Check, ChevronDown, Wrench } from "lucide-react";

import { ConfirmationCard } from "@/components/asistente/ConfirmationCard";
import { ProposalConfirmation } from "@/components/asistente/ProposalConfirmation";
import { previewTitle } from "@/lib/assistant/tool-summaries";
import {
  formatStepDuration,
  hrefLabel,
  outputEntriesOf,
  rowsLabel,
  stepAnnouncement,
  taskCardsOf,
  toolStepGroupsOf,
  toolsUsedLabel,
  toToolSteps,
  type ToolApprovalGroup,
  type ToolStep,
  type ToolStepGroup,
  type ToolStepState,
  type ToolStepTone,
  type ToolTaskCard,
} from "@/lib/assistant/tool-steps";
import { tramoColorClass, tramoColorSlot } from "@/lib/tramos/tramo-color";
import type { AssistantMessageMeta } from "@/lib/types/asistente";
import { cn } from "@/lib/utils";

/**
 * The tool steps of one assistant message (Asistente), shared by every
 * style: `timeline` (Visual), `compact` (Esencial) and `table` (Analítico).
 * Steps come from `toolStepGroupsOf` (`lib/assistant/tool-steps.ts`);
 * consecutive approvals of one tool render one `ConfirmationCard` when
 * `onApprove` is given.
 */
export type ToolStepsVariant = "timeline" | "compact" | "table";

export type ToolStepsProps = {
  parts: UIMessage["parts"];
  meta?: AssistantMessageMeta;
  variant?: ToolStepsVariant;
  /** Answers every approval id of a confirmation group once (`addToolApprovalResponse` per id). */
  onApprove?(approvalIds: string[], approved: boolean, reason?: string): void;
  /** "Editar" on a confirmation: the rows as composer text. */
  onEdit?(draft: string): void;
  /** Forces the first state of a group: open (`expanded`) or the summary (`collapsed`). */
  mode?: "expanded" | "collapsed";
};

const TONE_DOT: Record<string, string> = {
  1: "bg-tint-primary text-[color:var(--chart-1-ink)]",
  2: "bg-tint-violet text-[color:var(--chart-2-ink)]",
  3: "bg-tint-warning text-[color:var(--chart-3-ink)]",
  4: "bg-tint-cyan text-[color:var(--chart-4-ink)]",
  5: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning-ink",
};

function toneClass(tone: ToolStepTone | number): string {
  return TONE_DOT[String(tone)] ?? TONE_DOT[5]!;
}

const CHIP: Record<ToolStepState, { label: string; className: string }> = {
  running: { label: "En curso", className: "bg-muted text-muted-foreground" },
  confirmed: { label: "Confirmado", className: "bg-muted text-muted-foreground" },
  "needs-confirmation": { label: "Requiere confirmación", className: "bg-tint-warning text-warning-ink" },
  done: { label: "Listo", className: "bg-tint-success text-success" },
  error: { label: "Error", className: "bg-tint-destructive text-destructive-ink" },
  denied: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

const ACTIVE: ReadonlySet<ToolStepState> = new Set(["running", "confirmed", "needs-confirmation"]);

function isActive(steps: readonly ToolStep[]): boolean {
  return steps.some((step) => ACTIVE.has(step.state));
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={cn("spin size-3", className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StepChip({ state }: { state: ToolStepState }) {
  const chip = CHIP[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
        chip.className,
      )}
    >
      {state === "running" || state === "confirmed" ? <Spinner /> : null}
      {state === "done" ? <Check aria-hidden="true" className="size-3" /> : null}
      {chip.label}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const DAYS_CLASS = {
  high: "bg-tint-destructive text-destructive-ink",
  mid: "bg-tint-warning text-warning-ink",
  low: "bg-muted text-muted-foreground",
} as const;

function TaskCard({ card }: { card: ToolTaskCard }) {
  const slot = card.tramo ? tramoColorSlot(card.tramo) : null;
  const meta = [card.tramo?.name, card.person].filter(Boolean).join(" · ");
  const days = card.daysLate;
  return (
    <li className="lift relative flex flex-col gap-1.5 overflow-hidden rounded-[10px] border border-border bg-card py-2.5 pr-3 pl-4">
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", tramoColorClass(card.tramo))} />
      <span className="text-[13px] font-semibold text-foreground">{card.title}</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-sidebar-foreground">
        {card.person ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
              slot ? toneClass(slot) : "bg-muted text-muted-foreground",
            )}
          >
            {initials(card.person)}
          </span>
        ) : null}
        {meta ? <span className="min-w-0 flex-1">{meta}</span> : null}
        {days !== null ? (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono",
              days >= 10 ? DAYS_CLASS.high : days >= 5 ? DAYS_CLASS.mid : DAYS_CLASS.low,
            )}
          >
            {`${days.toLocaleString("es-MX")} d`}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function StepResults({ step }: { step: ToolStep }) {
  if (step.state !== "done" || step.output === undefined) return null;
  const cards = taskCardsOf(step.output);
  if (cards) {
    if (cards.length === 0) return null;
    return (
      <ul aria-label="Resultados" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.slice(0, 4).map((card, index) => (
          <TaskCard key={index} card={card} />
        ))}
      </ul>
    );
  }
  const entries = outputEntriesOf(step.output);
  if (entries) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {entries.map((entry, index) => (
          <div key={index} className="contents">
            <dt className="text-muted-foreground">{entry.key}</dt>
            <dd className="min-w-0 break-words text-foreground">{entry.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <pre className="max-h-60 overflow-auto rounded-md border border-border bg-card p-2 font-mono text-xs text-foreground">
      {JSON.stringify(step.output, null, 2)}
    </pre>
  );
}

function StepPanel({ step, id, results }: { step: ToolStep; id: string; results: boolean }) {
  const rows = rowsLabel(step);
  return (
    <div id={id} className="anim-in flex flex-col gap-2.5 rounded-xl border border-border bg-sidebar p-3">
      {step.params.length > 0 ? (
        <ul aria-label="Parámetros" className="flex flex-wrap gap-1.5">
          {step.params.map((param, index) => (
            <li key={index} className="rounded-md border border-border bg-card px-2 py-[3px] text-xs text-foreground">
              <span className="text-muted-foreground">{param.key}</span> {param.value}
            </li>
          ))}
        </ul>
      ) : null}
      {step.state === "error" && step.errorText ? <p className="text-xs text-destructive">{step.errorText}</p> : null}
      {results ? <StepResults step={step} /> : null}
      {step.href ? (
        <Link href={step.href} className="self-end text-xs font-medium text-secondary-foreground hover:underline">
          {[rows, `${hrefLabel(step.href)} →`].filter(Boolean).join(" · ")}
        </Link>
      ) : rows ? (
        <p className="self-end text-xs text-muted-foreground">{rows}</p>
      ) : null}
    </div>
  );
}

function StepItem({ step, last, results }: { step: ToolStep; last: boolean; results: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Icon = step.icon;
  const title = step.state === "running" ? step.running : step.label;
  return (
    <li className="flex gap-3" data-state={step.state} data-tool-call-id={step.toolCallId}>
      <div className="flex w-7 shrink-0 flex-col items-center">
        <span aria-hidden="true" className={cn("flex size-7 items-center justify-center rounded-full", toneClass(step.tone))}>
          <Icon className="size-3.5" />
        </span>
        {last ? null : <span aria-hidden="true" className="min-h-3 w-0.5 flex-1 bg-border" />}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2.5", last ? "pb-0" : "pb-3.5")}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-7 w-full flex-wrap items-center gap-x-2.5 gap-y-1 text-left text-[13.5px] font-medium text-foreground"
        >
          <span className="min-w-0 flex-1">{title}</span>
          <StepChip state={step.state} />
          <span className="font-mono text-[11.5px] font-normal text-muted-foreground">
            {formatStepDuration(step.durationMs)}
          </span>
          <ChevronDown aria-hidden="true" className="chev size-4 text-muted-foreground" />
        </button>
        {open ? <StepPanel step={step} id={panelId} results={results} /> : null}
      </div>
    </li>
  );
}

function StepList({ steps, results }: { steps: readonly ToolStep[]; results: boolean }) {
  return (
    <ol aria-label="Pasos del asistente" className="flex flex-col">
      {steps.map((step, index) => (
        <StepItem key={step.toolCallId} step={step} last={index === steps.length - 1} results={results} />
      ))}
    </ol>
  );
}

function SummaryPill({
  steps,
  totalMs,
  open,
  onToggle,
  controls,
}: {
  steps: readonly ToolStep[];
  totalMs: number | null;
  open: boolean;
  onToggle(): void;
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onToggle}
      className="inline-flex max-w-full items-center gap-2 self-start rounded-full border border-border bg-sidebar px-2.5 py-1.5 text-[12.5px] font-medium text-sidebar-foreground"
    >
      <span aria-hidden="true" className="flex items-center">
        {steps.slice(0, 4).map((step, index) => (
          <span
            key={step.toolCallId}
            className={cn("size-[18px] rounded-full ring-2 ring-sidebar", toneClass(step.tone), index > 0 && "-ml-1.5")}
          />
        ))}
      </span>
      <span>{toolsUsedLabel(steps.length)}</span>
      {totalMs !== null ? <span className="font-mono text-muted-foreground">{formatStepDuration(totalMs)}</span> : null}
      <ChevronDown aria-hidden="true" className="chev size-3.5 text-muted-foreground" />
    </button>
  );
}

/** Visual: the timeline while a step is active; a finished group starts as the summary pill. */
function TimelineGroup({
  steps,
  totalMs,
  mode,
}: {
  steps: readonly ToolStep[];
  totalMs: number | null;
  mode?: ToolStepsProps["mode"];
}) {
  const active = isActive(steps);
  const [open, setOpen] = useState(() => (mode ? mode === "expanded" : active));
  const listId = useId();
  if (active) return <StepList steps={steps} results />;
  return (
    <div className="flex flex-col gap-2">
      <SummaryPill steps={steps} totalMs={totalMs} open={open} onToggle={() => setOpen((v) => !v)} controls={listId} />
      {open ? (
        <div id={listId}>
          <StepList steps={steps} results />
        </div>
      ) : null}
    </div>
  );
}

/** Esencial: one text line ("Usó 2 herramientas · Ver"); expanded, the timeline without result cards. */
function CompactGroup({ steps, mode }: { steps: readonly ToolStep[]; mode?: ToolStepsProps["mode"] }) {
  const [open, setOpen] = useState(mode === "expanded");
  const listId = useId();
  const running = steps.find((step) => step.state === "running" || step.state === "confirmed");
  const failed = steps.some((step) => step.state === "error");
  const n = steps.length;
  const lead = failed
    ? "No se pudo completar un paso"
    : `Usó ${n.toLocaleString("es-MX")} ${n === 1 ? "herramienta" : "herramientas"}`;
  return (
    <div className="flex flex-col gap-2">
      {/* While a step runs, its running label takes the line's place. */}
      {running ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Spinner className="size-3.5" />
          {running.running}
        </p>
      ) : (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 self-start text-[12.5px]",
          failed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <Wrench aria-hidden="true" className="size-3.5" />
        <span>
          {lead} · <span className={failed ? undefined : "text-secondary-foreground"}>{open ? "Ocultar" : "Ver"}</span>
        </span>
      </button>
      )}
      {open && !running ? (
        <div id={listId}>
          <StepList steps={steps} results={false} />
        </div>
      ) : null}
    </div>
  );
}

const TABLE_STATE: Record<ToolStepState, { label: string; className: string }> = {
  done: { label: "✓ Listo", className: "font-medium text-success" },
  "needs-confirmation": { label: "● Requiere confirmación", className: "font-semibold text-warning-ink" },
  error: { label: "✕ Error", className: "font-medium text-destructive" },
  denied: { label: "Cancelado", className: "text-muted-foreground" },
  running: { label: "En curso", className: "text-muted-foreground" },
  confirmed: { label: "Confirmado", className: "text-muted-foreground" },
};

type TableRow = { key: string; tool: string; step: ToolStep; state: ToolStepState; durationMs: number | null; rows: number | null };

function approvalState(steps: readonly ToolStep[]): ToolStepState {
  const states = steps.map((step) => step.state);
  if (states.includes("needs-confirmation")) return "needs-confirmation";
  if (states.includes("running") || states.includes("confirmed")) return "confirmed";
  if (states.includes("error")) return "error";
  if (states.every((state) => state === "denied")) return "denied";
  return "done";
}

function tableRowsOf(groups: readonly ToolStepGroup[]): TableRow[] {
  return groups.flatMap((group): TableRow[] => {
    if (group.kind === "steps") {
      return group.steps.map((step) => ({
        key: step.toolCallId,
        tool: step.toolName,
        step,
        state: step.state,
        durationMs: step.durationMs,
        rows: step.rows,
      }));
    }
    const first = group.steps[0]!;
    const known = group.steps.map((s) => s.durationMs).filter((ms): ms is number => ms !== null);
    return [
      {
        key: first.toolCallId,
        tool: group.steps.length > 1 ? `${group.toolName} × ${group.steps.length}` : group.toolName,
        step: first,
        state: approvalState(group.steps),
        durationMs: known.length > 0 ? known.reduce((a, b) => a + b, 0) : null,
        rows: null,
      },
    ];
  });
}

/** Analítico: one table row per step (an approval group is "create_task × 4"). */
function StepsTable({ groups }: { groups: readonly ToolStepGroup[] }) {
  const rows = tableRowsOf(groups);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
        <caption className="sr-only">Pasos del asistente</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">#</th>
            <th scope="col" className="px-3 py-2 font-medium">Herramienta</th>
            <th scope="col" className="px-3 py-2 font-medium">Qué hizo</th>
            <th scope="col" className="px-3 py-2 font-medium">Parámetros</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Duración</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Filas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const state = TABLE_STATE[row.state];
            return (
              <tr
                key={row.key}
                data-state={row.state}
                className={cn("border-t border-border", row.state === "needs-confirmation" && "bg-tint-warning")}
              >
                <td className="px-3 py-2 font-mono text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-2 font-mono text-foreground">{row.tool}</td>
                <td className="px-3 py-2 text-foreground">{row.step.short}</td>
                <td className="px-3 py-2 font-mono text-sidebar-foreground">
                  {row.step.params.map((p) => `${p.key}=${p.value}`).join(" · ") || "—"}
                </td>
                <td className={cn("px-3 py-2", state.className)} title={row.step.errorText}>
                  <span className="inline-flex items-center gap-1">
                    {row.state === "running" || row.state === "confirmed" ? <Spinner /> : null}
                    {state.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-foreground">{formatStepDuration(row.durationMs)}</td>
                <td className="px-3 py-2 text-right font-mono text-foreground">
                  {row.rows === null ? "—" : row.rows.toLocaleString("es-MX")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalGroup({
  group,
  variant,
  mode,
  onApprove,
  onEdit,
}: {
  group: ToolApprovalGroup;
  variant: ToolStepsVariant;
  mode?: ToolStepsProps["mode"];
  onApprove?: ToolStepsProps["onApprove"];
  onEdit?: ToolStepsProps["onEdit"];
}) {
  if (!onApprove) {
    return variant === "compact" ? <CompactGroup steps={group.steps} mode={mode} /> : <StepList steps={group.steps} results />;
  }
  const ids = group.steps.map((step) => step.approvalId).filter((id): id is string => !!id);
  const Card = group.toolName === "apply_proposal" ? ProposalConfirmation : ConfirmationCard;
  return (
    <Card
      group={group}
      onRespond={(approved, reason) => onApprove(ids, approved, reason)}
      onEdit={variant === "compact" ? undefined : onEdit}
    />
  );
}

export function ToolSteps({ parts, meta, variant = "timeline", onApprove, onEdit, mode }: ToolStepsProps): ReactNode {
  const groups = toolStepGroupsOf(parts, meta);
  if (groups.length === 0) return null;

  if (variant === "table") {
    return (
      <div className="flex w-full flex-col gap-3">
        <StepsTable groups={groups} />
        {onApprove
          ? groups.map((group) =>
              group.kind === "approval" ? (
                <ApprovalGroup
                  key={group.steps[0]!.toolCallId}
                  group={group}
                  variant={variant}
                  onApprove={onApprove}
                  onEdit={onEdit}
                />
              ) : null,
            )
          : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {groups.map((group) => {
        const key = group.steps[0]!.toolCallId;
        if (group.kind === "approval") {
          return <ApprovalGroup key={key} group={group} variant={variant} mode={mode} onApprove={onApprove} onEdit={onEdit} />;
        }
        return variant === "compact" ? (
          <CompactGroup key={key} steps={group.steps} mode={mode} />
        ) : (
          <TimelineGroup key={key} steps={group.steps} totalMs={group.totalMs} mode={mode} />
        );
      })}
    </div>
  );
}

// ── Live region ─────────────────────────────────────────────────────────────

/** "Requiere confirmación: Crear 4 tareas" for a group; the step label for a tool without preview copy. */
function confirmationLine(group: ToolApprovalGroup): string {
  const what = previewTitle(group.toolName, group.steps.length)
    .replace(/^¿Confirmas\s*/, "")
    .replace(/\?$/, "");
  if (what === "esta acción") return `Requiere confirmación: ${group.steps[0]!.label}`;
  return `Requiere confirmación: ${what.charAt(0).toUpperCase()}${what.slice(1)}`;
}

/**
 * The step announcements of a chat (one visually hidden `aria-live` region
 * per chat): "Buscando tus tareas…", "Listo: …", "Requiere confirmación: …",
 * "Error: …". Each step state change is announced once; steps already on
 * screen when the chat mounts are not announced, and message text is never
 * read from here.
 */
export function ToolStepsLiveRegion({ messages }: { messages: readonly UIMessage[] }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Map<string, ToolStepState> | null>(null);

  useEffect(() => {
    const groups = messages.filter((message) => message.role === "assistant").flatMap((message) => toToolSteps(message));
    const known = seen.current;
    if (known === null) {
      seen.current = new Map(groups.flatMap((group) => group.steps.map((step) => [step.toolCallId, step.state] as const)));
      return;
    }
    const lines: string[] = [];
    for (const group of groups) {
      const changed = group.steps.filter((step) => known.get(step.toolCallId) !== step.state);
      for (const step of changed) known.set(step.toolCallId, step.state);
      if (changed.length === 0) continue;
      if (group.kind === "approval" && changed.every((step) => step.state === "needs-confirmation")) {
        lines.push(confirmationLine(group));
        continue;
      }
      for (const step of changed) {
        const line = stepAnnouncement(step);
        if (line) lines.push(line);
      }
    }
    if (lines.length > 0 && regionRef.current) regionRef.current.textContent = lines.join(". ");
  }, [messages]);

  return <div ref={regionRef} aria-live="polite" aria-atomic="true" className="sr-only" data-testid="tool-steps-live" />;
}
