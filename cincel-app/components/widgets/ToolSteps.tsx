"use client";

import type { ReactNode } from "react";
import type { UIMessage } from "ai";

import type { AssistantMessageMeta } from "@/lib/types/asistente";

/**
 * The tool steps of one assistant message (Asistente). Minimal markup for
 * now: one list item per tool part with its tool name. Full behavior in the
 * Asistente tool steps issue.
 */
export type ToolStepsProps = {
  parts: UIMessage["parts"];
  meta?: AssistantMessageMeta;
  mode?: "expanded" | "collapsed";
};

type Part = UIMessage["parts"][number];

/** The tool name of a tool part, or null for any other part. */
function toolName(part: Part): string | null {
  if (part.type === "dynamic-tool") return "toolName" in part ? String(part.toolName) : "dynamic-tool";
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return null;
}

export function ToolSteps({ parts }: ToolStepsProps): ReactNode {
  const steps = parts.flatMap((part, index) => {
    const name = toolName(part);
    return name === null ? [] : [{ key: "toolCallId" in part ? String(part.toolCallId) : String(index), name }];
  });
  return (
    <ol aria-label="Pasos del asistente">
      {steps.map((step) => (
        <li key={step.key}>{step.name}</li>
      ))}
    </ol>
  );
}
