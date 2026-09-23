import { DEPARTMENTOS, phasesFor } from "@/lib/actividades/departamento";

/** Trim, drop blanks and case-insensitive duplicates, keeping first-seen order. */
export function normalizePhases(list: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = raw?.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

/**
 * Phase names to offer when editing a project's phases: every department
 * template's phases in workflow order, plus any custom ones the project
 * already has (so they can be unticked).
 */
export function projectPhaseOptions(current: ReadonlyArray<string> = []): string[] {
  const known = DEPARTMENTOS.flatMap((d) => phasesFor(d.template));
  return normalizePhases([...known, ...current]);
}
