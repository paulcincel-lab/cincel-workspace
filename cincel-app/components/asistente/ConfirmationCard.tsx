"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { CheckIcon, CircleAlertIcon, ShieldQuestion, XIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import {
  previewConfirmLabel,
  previewDraft,
  previewSharedDate,
  previewTitle,
  previewToolCall,
  summarizeToolCall,
  type ToolPreviewRow,
} from "@/lib/assistant/tool-summaries";
import { toToolStep, type ToolApprovalGroup, type ToolStep } from "@/lib/assistant/tool-steps";
import { actionErrorText } from "@/lib/errors";
import { tramoColorClass } from "@/lib/tramos/tramo-color";
import { cn } from "@/lib/utils";

/** One approval-gated call (the single-call form of the card). */
export type ConfirmationPart = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: "approval-requested" | "approval-responded" | "output-available" | "output-denied" | "output-error";
  approvalId: string;
  errorText?: string;
  output?: unknown;
  /** For `approval-responded`: the answer. */
  approved?: boolean;
};

export type ConfirmationCardProps = {
  /** A single approval. */
  part?: ConfirmationPart;
  /** Consecutive approvals of one tool (`toolStepGroupsOf`): one card answers them all. */
  group?: ToolApprovalGroup;
  /** Answers every approval of the card, once (`addToolApprovalResponse` per id). */
  onRespond(approved: boolean, reason?: string): void;
  /** "Editar": the card is denied with reason "editado" and its rows go to the composer as text. */
  onEdit?(draft: string): void;
};

/** Labels (FE §3.9, §13). */
export const CONFIRMATION_LABELS = {
  title: "¿Confirmas esta acción?",
  confirm: "Confirmar",
  cancel: "Cancelar",
  edit: "Editar",
  done: "Hecho",
  cancelled: "Cancelado",
  running: "Confirmado. Ejecutando…",
  waiting: "Esperando tu confirmación",
  noChange: "nada cambia hasta que confirmes",
} as const;

/** Reason sent with the denial when the user chose "Editar". */
export const EDITED_REASON = "editado";

function groupOfPart(part: ConfirmationPart): ToolApprovalGroup {
  const approved = part.state === "output-denied" ? false : part.approved;
  const step = toToolStep({
    type: `tool-${part.toolName}`,
    toolCallId: part.toolCallId,
    state: part.state,
    input: part.input,
    output: part.output,
    errorText: part.errorText,
    approval: { id: part.approvalId, ...(approved !== undefined ? { approved } : {}) },
  });
  const row = previewToolCall(part.toolName, part.input);
  return { kind: "approval", toolName: part.toolName, steps: [step], preview: row ? [row] : [] };
}

type Phase = "pending" | "running" | "final";
type Answer = null | "confirmed" | "cancelled";

function phaseOf(steps: readonly ToolStep[]): Phase {
  if (steps.some((step) => step.state === "needs-confirmation")) return "pending";
  if (steps.some((step) => step.state === "running" || step.state === "confirmed")) return "running";
  return "final";
}

const ROW_CLASS: Record<ToolPreviewRow["op"], { row: string; op: string }> = {
  "+": { row: "bg-tint-success", op: "text-success" },
  "~": { row: "bg-tint-warning", op: "text-warning-ink" },
  "−": { row: "bg-tint-destructive", op: "text-destructive-ink" },
};

const TYPING_DOTS: CSSProperties[] = [0, 150, 300].map((ms) => ({ "--anim-delay": `${ms}ms` }) as CSSProperties);

/** The project every call of the group names, from the step parameters; null when they differ. */
function sharedProject(steps: readonly ToolStep[]): string | null {
  const names = steps.map((step) => step.params.find((param) => param.key === "proyecto")?.value ?? "");
  const first = names[0];
  return first && names.every((name) => name === first) ? first : null;
}

/**
 * `render_confirmation` (redesign FE §3.9, §4.9): the native approval
 * request of one or more consecutive calls of the same tool. With a row
 * preview (`toolPreviews`): "¿Confirmas crear 4 tareas?", one row per call
 * and "Confirmar y crear 4"; without one, the summary from
 * `toolSummaries`. Buttons lock on the first click; the result line
 * ("Hecho", "Cancelado", "3 de 4 hechas" or the error) replaces them and
 * takes the focus after the answer.
 */
export function ConfirmationCard({ part, group: groupProp, onRespond, onEdit }: ConfirmationCardProps) {
  const titleId = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  // Locks after the first click so the approvals are sent once while the chat
  // resubmits and the parts leave `approval-requested`.
  const [answer, setAnswer] = useState<Answer>(null);

  useEffect(() => {
    if (answer) resultRef.current?.focus();
  }, [answer]);

  const group = groupProp ?? (part ? groupOfPart(part) : null);
  if (!group || group.steps.length === 0) return null;

  const n = group.steps.length;
  const rows = group.preview.length === n ? group.preview : [];
  const hasPreview = rows.length > 0;
  const phase = phaseOf(group.steps);

  function respond(approved: boolean, reason?: string) {
    if (answer !== null || phase !== "pending") return;
    setAnswer(approved ? "confirmed" : "cancelled");
    if (reason === undefined) onRespond(approved);
    else onRespond(approved, reason);
  }

  function edit() {
    if (!onEdit || !group) return;
    respond(false, EDITED_REASON);
    onEdit(previewDraft(group.toolName, rows));
  }

  const title = hasPreview ? previewTitle(group.toolName, n) : CONFIRMATION_LABELS.title;
  const subline = hasPreview
    ? [sharedProject(group.steps), previewSharedDate(group.toolName, rows), CONFIRMATION_LABELS.noChange]
        .filter(Boolean)
        .join(" · ")
    : null;
  const descriptions = part ? [summarizeToolCall(part.toolName, part.input)] : group.steps.map((step) => step.label);
  const pending = phase === "pending";
  const showResult = answer !== null || !pending;

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-tool-call-id={group.steps[0]?.toolCallId}
      data-state={part?.state ?? phase}
      className={cn(
        "flex w-full flex-col gap-3 rounded-[14px] border border-primary/30 bg-card p-4 text-card-foreground",
        pending && answer === null && "glow",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-tint-warning text-warning-ink"
        >
          <ShieldQuestion className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p id={titleId} className="text-sm font-semibold text-foreground">
            {title}
          </p>
          {hasPreview ? (
            <p className="text-[12.5px] text-muted-foreground">{subline}</p>
          ) : (
            descriptions.map((line, index) => (
              <p key={index} className="text-[12.5px] text-muted-foreground">
                {line}
              </p>
            ))
          )}
        </div>
      </div>

      {hasPreview ? <PreviewRows rows={rows} steps={group.steps} /> : null}

      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-9 rounded-[10px] text-[13.5px] font-semibold"
            onClick={() => respond(true)}
            disabled={answer !== null}
          >
            {hasPreview ? previewConfirmLabel(rows) : CONFIRMATION_LABELS.confirm}
          </Button>
          {onEdit && hasPreview ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-[10px] text-[13.5px]"
              onClick={edit}
              disabled={answer !== null}
            >
              {CONFIRMATION_LABELS.edit}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-[10px] text-[13.5px]"
            onClick={() => respond(false)}
            disabled={answer !== null}
          >
            {CONFIRMATION_LABELS.cancel}
          </Button>
        </div>
      ) : null}

      {pending && answer === null ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span aria-hidden="true" className="flex items-center gap-1">
            {TYPING_DOTS.map((style, index) => (
              <span key={index} className="typing size-1.5 rounded-full bg-primary" style={style} />
            ))}
          </span>
          {CONFIRMATION_LABELS.waiting}
        </p>
      ) : null}

      {showResult ? (
        <div ref={resultRef} tabIndex={-1} data-confirmation-result="" className="outline-none">
          <ConfirmationResult phase={phase} answer={answer} steps={group.steps} rows={rows} />
        </div>
      ) : null}
    </div>
  );
}

function PreviewRows({ rows, steps }: { rows: readonly ToolPreviewRow[]; steps: readonly ToolStep[] }) {
  return (
    <ul className="overflow-hidden rounded-[10px] border border-border">
      {rows.map((row, index) => {
        const failed = steps[index]?.state === "error";
        const tone = ROW_CLASS[row.op];
        return (
          <li
            key={steps[index]?.toolCallId ?? index}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-[13px] last:border-b-0",
              failed ? "bg-tint-destructive" : tone.row,
            )}
          >
            <span aria-hidden="true" className={cn("font-mono font-semibold", failed ? "text-destructive-ink" : tone.op)}>
              {row.op}
            </span>
            <span className={cn("min-w-0 flex-1", failed ? "text-destructive-ink" : "text-foreground")}>{row.title}</span>
            {row.tramo ? (
              <span className="flex items-center gap-1.5 text-xs text-foreground-soft">
                <span aria-hidden="true" className={cn("size-[7px] rounded-full", tramoColorClass(row.tramo))} />
                {row.tramo.name}
              </span>
            ) : null}
            {row.person ? <span className="w-[84px] truncate text-xs text-foreground-soft">{row.person}</span> : null}
            {row.date ? <span className="font-mono text-xs text-foreground-soft">{row.date}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function ConfirmationResult({
  phase,
  answer,
  steps,
  rows,
}: {
  phase: Phase;
  answer: Answer;
  steps: readonly ToolStep[];
  rows: readonly ToolPreviewRow[];
}) {
  if (phase === "running" || (phase === "pending" && answer === "confirmed")) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="spin size-4">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        {CONFIRMATION_LABELS.running}
      </p>
    );
  }
  if (phase === "pending") return <CancelledLine />;

  const n = steps.length;
  const done = steps.filter((step) => step.state === "done").length;
  const failed = steps.filter((step) => step.state === "error");
  const denied = steps.filter((step) => step.state === "denied").length;

  if (failed.length === n) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertDescription>{failed[0]?.errorText ?? actionErrorText("")}</AlertDescription>
      </Alert>
    );
  }
  if (denied === n) return <CancelledLine />;
  if (done === n) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckIcon aria-hidden="true" className="size-4" />
        {CONFIRMATION_LABELS.done}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckIcon aria-hidden="true" className="size-4" />
        {`${done.toLocaleString("es-MX")} de ${n.toLocaleString("es-MX")} hechas`}
      </p>
      {failed.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {failed.map((step) => {
            const row = rows[steps.indexOf(step)];
            return (
              <li key={step.toolCallId} className="text-xs text-destructive">
                {`${row?.title ?? step.label}: ${step.errorText ?? actionErrorText("")}`}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function CancelledLine() {
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <XIcon aria-hidden="true" className="size-4" />
      {CONFIRMATION_LABELS.cancelled}
    </p>
  );
}
