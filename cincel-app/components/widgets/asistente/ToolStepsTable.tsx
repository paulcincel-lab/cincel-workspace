"use client";

import type { ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { formatCount, formatSeconds, STEP_STATE_TEXT, stepTableRows, type StepTableRow } from "@/lib/assistant/step-tables";
import type { ToolStepGroup } from "@/lib/assistant/tool-steps";
import { actionErrorText } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * `ToolSteps variant="table"` (Asistente Analítico): every tool part of one
 * message as a row (# · Herramienta · Qué hizo · Parámetros · Estado ·
 * Duración · Filas). Consecutive same-tool approvals are one row
 * ("create_task × 4").
 */
export type ToolStepsTableProps = { groups: ToolStepGroup[] };

const HEADERS: { key: string; label: string; right?: boolean }[] = [
  { key: "index", label: "#" },
  { key: "tool", label: "Herramienta" },
  { key: "short", label: "Qué hizo" },
  { key: "params", label: "Parámetros" },
  { key: "state", label: "Estado" },
  { key: "duration", label: "Duración", right: true },
  { key: "rows", label: "Filas", right: true },
];

const TH = "border-b border-border bg-muted px-2.5 py-2 font-mono text-[11px] font-medium tracking-[.08em] whitespace-nowrap text-muted-foreground uppercase";
const TD = "border-b border-accent px-2.5 py-[7px] align-top";

/** A step's error for people: error codes ("FORBIDDEN: …") through `actionErrorText`, messages as they are. */
export function stepErrorText(errorText: string | undefined): string {
  const text = errorText?.trim() ?? "";
  if (text === "" || /^[A-Z][A-Z_]+(?::|$)/.test(text)) return actionErrorText(text);
  return text;
}

export function StepStateCell({ row }: { row: Pick<StepTableRow, "state" | "errorText"> }): ReactNode {
  switch (row.state) {
    case "done":
      return <span className="font-medium whitespace-nowrap text-success">✓ {STEP_STATE_TEXT.done}</span>;
    case "needs-confirmation":
      return (
        <span className="font-semibold whitespace-nowrap text-warning">● {STEP_STATE_TEXT["needs-confirmation"]}</span>
      );
    case "error": {
      const message = stepErrorText(row.errorText);
      return (
        <Tooltip>
          <TooltipTrigger className="cursor-help rounded-sm font-medium whitespace-nowrap text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">
            ✕ {STEP_STATE_TEXT.error}
            <span className="sr-only">: {message}</span>
          </TooltipTrigger>
          <TooltipContent>{message}</TooltipContent>
        </Tooltip>
      );
    }
    case "denied":
      return <span className="whitespace-nowrap text-muted-foreground">{STEP_STATE_TEXT.denied}</span>;
    default:
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          <LoaderCircleIcon aria-hidden="true" className="spin size-3.5" />
          {STEP_STATE_TEXT.running}
        </span>
      );
  }
}

export function ToolStepsTable({ groups }: ToolStepsTableProps): ReactNode {
  const rows = stepTableRows(groups);
  if (rows.length === 0) return null;
  return (
    <div data-slot="tool-steps-table" className="overflow-x-auto rounded-[10px] border border-border bg-card">
      <table aria-label="Pasos del asistente" className="w-full border-collapse text-left text-[12.5px]">
        <thead>
          <tr>
            {HEADERS.map((header) => (
              <th key={header.key} scope="col" className={cn(TH, header.right ? "text-right" : "text-left")}>
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              data-state={row.state}
              className={row.state === "needs-confirmation" ? "bg-tint-warning" : undefined}
            >
              <td className={cn(TD, "font-mono text-muted-foreground")}>{row.index}</td>
              <td className={cn(TD, "font-mono whitespace-nowrap")}>{row.tool}</td>
              <td className={TD}>{row.short}</td>
              <td className={cn(TD, "font-mono text-sidebar-foreground")}>{row.params || "—"}</td>
              <td className={TD}>
                <StepStateCell row={row} />
              </td>
              <td className={cn(TD, "text-right font-mono whitespace-nowrap tabular-nums")}>{formatSeconds(row.durationMs)}</td>
              <td className={cn(TD, "text-right font-mono tabular-nums")}>{row.rows === null ? "—" : formatCount(row.rows)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
