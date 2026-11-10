"use client";

import type { ReactNode } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AssistantCardMessage } from "@/components/asistente/AssistantCardMessage";
import { AssistantChartMessage } from "@/components/asistente/AssistantChartMessage";
import { AssistantListMessage } from "@/components/asistente/AssistantListMessage";
import { AssistantStatGridMessage } from "@/components/asistente/AssistantStatGridMessage";
import { AssistantTableMessage, type RenderTableArgs } from "@/components/asistente/AssistantTableMessage";
import { AssistantTimelineMessage, type RenderTimelineArgs } from "@/components/asistente/AssistantTimelineMessage";
import type { WidgetTone } from "@/components/asistente/tone";
import { ToolSteps, type ToolStepsVariant } from "@/components/widgets/ToolSteps";
import { RENDER_WIDGET_TOOLS, toolNameOfPart, toolPartOf } from "@/lib/assistant/tool-steps";
import type { AssistantMessageMeta } from "@/lib/types/asistente";

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

/** A tool part that is a step (not a `render_*` widget). */
function isStepPart(part: AnyPart): boolean {
  const tool = toolPartOf(part);
  return !!tool && !RENDER_WIDGET_TOOLS.has(toolNameOfPart(tool));
}

/** Parts that neither are steps nor render anything (`step-start`, reasoning, sources, data). */
function isSilentPart(part: AnyPart): boolean {
  return part.type !== "text" && !part.type.startsWith("tool-") && part.type !== "dynamic-tool";
}

type Segment = { kind: "steps"; start: number; parts: AnyPart[] } | { kind: "part"; index: number; part: AnyPart };

/** Consecutive step parts in one segment (silent parts in between don't split it); every other part alone. */
function segmentsOf(parts: readonly AnyPart[]): Segment[] {
  const segments: Segment[] = [];
  parts.forEach((part, index) => {
    if (isStepPart(part)) {
      const last = segments.at(-1);
      if (last?.kind === "steps") last.parts.push(part);
      else segments.push({ kind: "steps", start: index, parts: [part] });
      return;
    }
    if (isSilentPart(part)) return;
    segments.push({ kind: "part", index, part });
  });
  return segments;
}

const USER_BUBBLE_CLASS = {
  primary: "max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground",
  ink: "max-w-[85%] whitespace-pre-wrap rounded-lg bg-foreground px-3 py-2 text-sm text-background",
} as const;

export type AssistantMessagePartsProps = {
  message: UIMessage;
  /**
   * Answers native approval requests (`addToolApprovalResponse` per id). When
   * set, consecutive approvals of one tool render one `ConfirmationCard`.
   */
  onToolApproval?(approvalIds: string[], approved: boolean, reason?: string): void;
  /** "Editar" on a confirmation card: puts the rows in the composer. */
  onEditDraft?(text: string): void;
  /** User bubble colors: `primary` (the /asistente page) or `ink` (the sheet, `foreground` on dark ink). */
  userBubble?: keyof typeof USER_BUBBLE_CLASS;
  /** Tool steps layout: `timeline` (the page) or `compact` (the sheet). */
  stepsVariant?: ToolStepsVariant;
};

/**
 * One message's parts: text, widget tools and the tool steps (`ToolSteps`:
 * consecutive tool parts in one block, grouped approvals in one card).
 * Shared by `AssistantChat` and `AssistantSheet`.
 */
export function AssistantMessageParts({
  message,
  onToolApproval,
  onEditDraft,
  userBubble = "primary",
  stepsVariant = "timeline",
}: AssistantMessagePartsProps) {
  const meta = message.metadata as AssistantMessageMeta | undefined;
  const segments = segmentsOf(message.parts);

  return (
    <>
      {segments.map((segment) =>
        segment.kind === "steps" ? (
          <ToolSteps
            key={`steps-${segment.start}`}
            parts={segment.parts}
            meta={meta}
            variant={stepsVariant}
            onApprove={onToolApproval}
            onEdit={onEditDraft}
          />
        ) : (
          renderPart(segment.part, segment.index)
        ),
      )}
    </>
  );

  function renderPart(part: AnyPart, index: number): ReactNode {
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

    return null;
  }
}
