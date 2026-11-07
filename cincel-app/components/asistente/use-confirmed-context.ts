"use client";

import { useEffect, useState } from "react";

import { fetchProjectAction } from "@/lib/actions/projects-actions";
import { fetchStaffDetailAction } from "@/lib/actions/staff-actions";
import { fetchTaskAction } from "@/lib/actions/tasks-actions";
import type { AssistantContext } from "@/lib/types/redesign";

/** The entity the server confirmed the viewer can see; drives the "Viendo: {entity}" chip. */
export type ConfirmedContext = { kind: "project" | "task" | "person"; id: string; label: string };

/**
 * Resolves the page context through the same viewer-scoped reads the chat
 * route uses (BE §8.10): an id the viewer can't see (or that doesn't exist)
 * resolves to null, so no chip is shown for it. The most specific id wins:
 * task, then person, then project.
 */
export async function resolveConfirmedContext(context: AssistantContext): Promise<ConfirmedContext | null> {
  try {
    if (context.taskId) {
      const task = await fetchTaskAction(context.taskId);
      if (task) return { kind: "task", id: task.id, label: task.title };
    }
    if (context.personId) {
      const person = await fetchStaffDetailAction(context.personId);
      if (person) {
        const label = [person.name, person.lastName].filter(Boolean).join(" ");
        return { kind: "person", id: person.id, label };
      }
    }
    if (context.projectId) {
      const project = await fetchProjectAction(context.projectId);
      if (project) return { kind: "project", id: project.id, label: project.name };
    }
  } catch {
    // Not visible or not reachable: no chip.
  }
  return null;
}

export function useConfirmedContext(context: AssistantContext, enabled: boolean): ConfirmedContext | null {
  const { projectId, taskId, personId } = context;
  const [confirmed, setConfirmed] = useState<{ key: string; value: ConfirmedContext | null } | null>(null);
  const key = `${projectId ?? ""}|${taskId ?? ""}|${personId ?? ""}`;

  useEffect(() => {
    if (!enabled || (!projectId && !taskId && !personId)) return;
    let cancelled = false;
    resolveConfirmedContext({ route: "", projectId, taskId, personId }).then((value) => {
      if (!cancelled) setConfirmed({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, projectId, taskId, personId]);

  if (!projectId && !taskId && !personId) return null;
  return confirmed && confirmed.key === key ? confirmed.value : null;
}
