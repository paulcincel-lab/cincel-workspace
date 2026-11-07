"use client";

import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AssistantCardMessage } from "@/components/asistente/AssistantCardMessage";
import { AssistantChartMessage } from "@/components/asistente/AssistantChartMessage";
import { AssistantListMessage } from "@/components/asistente/AssistantListMessage";
import { AssistantStatGridMessage } from "@/components/asistente/AssistantStatGridMessage";
import { AssistantTableMessage, type RenderTableArgs } from "@/components/asistente/AssistantTableMessage";
import { AssistantTimelineMessage, type RenderTimelineArgs } from "@/components/asistente/AssistantTimelineMessage";
import { ConfirmationCard, type ConfirmationCardProps } from "@/components/asistente/ConfirmationCard";
import type { WidgetTone } from "@/components/asistente/tone";

// render_chart's input shape (lib/assistant/tools.ts) — duplicated here since
// that module is server-only.
type RenderChartInput = {
  chartType: "bar" | "line";
  title: string;
  data: { label: string; value: number }[];
};

// render_card / render_stat_grid / render_list input shapes — same reasoning.
type RenderCardInput = {
  title: string;
  subtitle?: string;
  fields: { label: string; value: string }[];
  badge?: { label: string; tone: WidgetTone };
};
type RenderStatGridInput = {
  title?: string;
  stats: { label: string; value: string; badge?: { label: string; tone: WidgetTone } }[];
};
type RenderListInput = {
  title: string;
  items: string[];
};

type AnyPart = UIMessage["parts"][number];

type ApprovalToolPart = {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean };
};

function toolNameOf(part: ApprovalToolPart): string {
  return part.type === "dynamic-tool" ? (part.toolName ?? "") : part.type.slice("tool-".length);
}

function isApprovalToolPart(part: AnyPart): part is AnyPart & ApprovalToolPart {
  const p = part as Partial<ApprovalToolPart> & { type: string };
  return (p.type.startsWith("tool-") || p.type === "dynamic-tool") && !!p.approval && typeof p.toolCallId === "string";
}

const USER_BUBBLE_CLASS = {
  primary: "max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground",
  ink: "max-w-[85%] whitespace-pre-wrap rounded-lg bg-foreground px-3 py-2 text-sm text-background",
} as const;

export type AssistantMessagePartsProps = {
  message: UIMessage;
  /**
   * Answers a native approval request (`addToolApprovalResponse`). When set,
   * approval-gated tool parts render `ConfirmationCard`.
   */
  onToolApproval?(approvalId: string, approved: boolean): void;
  /** User bubble colors: `primary` (the /asistente page) or `ink` (the sheet, `foreground` on dark ink). */
  userBubble?: keyof typeof USER_BUBBLE_CLASS;
};

const CARD_STATES: readonly ConfirmationCardProps["part"]["state"][] = [
  "approval-requested",
  "output-available",
  "output-denied",
  "output-error",
];

function renderApprovalPart(
  part: ApprovalToolPart,
  index: number,
  onToolApproval: (approvalId: string, approved: boolean) => void,
) {
  const approval = part.approval!;
  if (part.state === "approval-responded") {
    if (approval.approved === false) {
      return (
        <ConfirmationCard
          key={index}
          part={{ toolCallId: part.toolCallId, toolName: toolNameOf(part), input: part.input, state: "output-denied", approvalId: approval.id }}
          onRespond={() => {}}
        />
      );
    }
    return (
      <p key={index} className="text-xs text-muted-foreground">
        Confirmado. Ejecutando…
      </p>
    );
  }
  const state = CARD_STATES.find((s) => s === part.state);
  if (!state) return null;
  const cardPart: ConfirmationCardProps["part"] = {
    toolCallId: part.toolCallId,
    toolName: toolNameOf(part),
    input: part.input,
    state,
    approvalId: approval.id,
    errorText: part.errorText,
  };
  return (
    <ConfirmationCard key={index} part={cardPart} onRespond={(approved) => onToolApproval(approval.id, approved)} />
  );
}

/** One message's parts: text, widget tools and tool progress lines (shared by `AssistantChat` and `AssistantSheet`). */
export function AssistantMessageParts({ message, onToolApproval, userBubble = "primary" }: AssistantMessagePartsProps) {
  return (
    <>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return message.role === "user" ? (
            <div key={index} className={USER_BUBBLE_CLASS[userBubble]}>
              {part.text}
            </div>
          ) : (
            <div
              key={index}
              className="max-w-full text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            </div>
          );
        }

        if (onToolApproval && isApprovalToolPart(part)) {
          return renderApprovalPart(part, index, onToolApproval);
        }

        if (part.type === "tool-render_chart") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                Generando gráfico…
              </p>
            );
          }
          if (part.state === "output-available") {
            const chart = part.input as RenderChartInput;
            return (
              <div key={index} className="w-full max-w-md">
                <AssistantChartMessage chartType={chart.chartType} title={chart.title} data={chart.data} />
              </div>
            );
          }
          return null;
        }

        if (part.type === "tool-render_card") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                Generando tarjeta…
              </p>
            );
          }
          if (part.state === "output-available") {
            const card = part.input as RenderCardInput;
            return (
              <div key={index} className="w-full">
                <AssistantCardMessage title={card.title} subtitle={card.subtitle} fields={card.fields} badge={card.badge} />
              </div>
            );
          }
          return null;
        }

        if (part.type === "tool-render_stat_grid") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                Generando comparación…
              </p>
            );
          }
          if (part.state === "output-available") {
            const grid = part.input as RenderStatGridInput;
            return (
              <div key={index} className="w-full">
                <AssistantStatGridMessage title={grid.title} stats={grid.stats} />
              </div>
            );
          }
          return null;
        }

        if (part.type === "tool-render_list") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                Generando lista…
              </p>
            );
          }
          if (part.state === "output-available") {
            const list = part.input as RenderListInput;
            return (
              <div key={index} className="w-full">
                <AssistantListMessage title={list.title} items={list.items} />
              </div>
            );
          }
          return null;
        }

        if (onToolApproval && part.type === "tool-render_table") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                Generando tabla…
              </p>
            );
          }
          if (part.state === "output-available") {
            return (
              <div key={index} className="w-full">
                <AssistantTableMessage {...(part.input as RenderTableArgs)} />
              </div>
            );
          }
          return null;
        }

        if (onToolApproval && part.type === "tool-render_timeline") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                Generando agenda…
              </p>
            );
          }
          if (part.state === "output-available") {
            return (
              <div key={index} className="w-full">
                <AssistantTimelineMessage {...(part.input as RenderTimelineArgs)} />
              </div>
            );
          }
          return null;
        }

        if (
          part.type === "tool-list_projects" ||
          part.type === "tool-list_activities_due" ||
          part.type === "tool-team_workload_summary" ||
          part.type === "tool-find_duplicates"
        ) {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                {part.type === "tool-find_duplicates" ? "Buscando duplicados…" : "Consultando datos…"}
              </p>
            );
          }
          return null;
        }

        if (
          part.type === "tool-create_task" ||
          part.type === "tool-assign_task" ||
          part.type === "tool-create_client" ||
          part.type === "tool-onboard_client" ||
          part.type === "tool-create_rfc" ||
          part.type === "tool-merge_duplicate_clients" ||
          part.type === "tool-merge_duplicate_activities" ||
          part.type === "tool-discard_project"
        ) {
          const label =
            part.type === "tool-create_task"
              ? "Creando tarea…"
              : part.type === "tool-assign_task"
                ? "Reasignando responsable…"
                : part.type === "tool-create_client"
                  ? "Dando de alta al cliente…"
                  : part.type === "tool-onboard_client"
                    ? "Arrancando cliente y tareas…"
                    : part.type === "tool-create_rfc"
                      ? "Creando RFC en GitHub…"
                      : part.type === "tool-discard_project"
                        ? "Descartando proyecto y tareas…"
                        : "Fusionando duplicados…";
          if (part.state === "input-streaming" || part.state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                {label}
              </p>
            );
          }
          return null;
        }

        if (onToolApproval && (part.type.startsWith("tool-") || part.type === "dynamic-tool")) {
          const state = (part as { state?: string }).state;
          if (state === "input-streaming" || state === "input-available") {
            return (
              <p key={index} className="text-xs text-muted-foreground">
                Consultando datos…
              </p>
            );
          }
        }

        return null;
      })}
    </>
  );
}
