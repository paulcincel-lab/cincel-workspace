import "server-only";

import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import type { ProjectListItem, Staff } from "@/lib/types/core";

/**
 * Name → row resolution for assistant tools (redesign BE §10.3). The model
 * only knows people and projects by name, so every tool resolves names through
 * the same viewer-scoped read actions the UI uses and reports the candidates
 * when the match isn't unique.
 */

export type Resolved<T> = { ok: true; value: T } | { ok: false; error: string; candidates?: string[] };

export function byNameIlike<T extends { name: string }>(rows: T[], query: string): Resolved<T> {
  const q = query.trim().toLowerCase();
  const exact = rows.filter((r) => r.name.trim().toLowerCase() === q);
  if (exact.length === 1) return { ok: true, value: exact[0] };
  const partial = rows.filter((r) => r.name.toLowerCase().includes(q));
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length === 0) {
    return { ok: false, error: `No se encontró "${query}".` };
  }
  return {
    ok: false,
    error: `"${query}" es ambiguo, coincide con varios.`,
    candidates: partial.slice(0, 10).map((r) => r.name),
  };
}

export async function resolveProject(name: string): Promise<Resolved<ProjectListItem>> {
  const rows = await fetchProjectsAction({ search: name });
  return byNameIlike(rows, name);
}

export async function resolveStaff(name: string): Promise<Resolved<Staff>> {
  const rows = await fetchStaffAction();
  return byNameIlike(rows, name);
}
