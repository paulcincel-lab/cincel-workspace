import type { ScheduleStatus } from "@/lib/types/schedule";

export interface LegacyState {
  statusByKey: Record<string, ScheduleStatus>;
  flagByKey: Record<string, boolean>;
  imprevistos: Array<{ fecha: string; texto: string }>;
}

function normalizeLegacyStatus(v: unknown): ScheduleStatus | null {
  if (v === true || v === "done") return "done";
  if (v === "progress") return "progress";
  return null;
}

/**
 * Parses the legacy dashboard's exported JSON (`{ done, flags, imprevistos }`,
 * see docs/specs/backend.md §8.2). stableKey matching against the schedule's
 * actual tasks happens at the action layer, since this module is pure.
 */
export function parseLegacyState(raw: unknown): { ok: true; state: LegacyState } | { ok: false; error: string } {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, error: "El JSON no es válido." };
    }
  }
  if (!obj || typeof obj !== "object") {
    return { ok: false, error: "El JSON debe ser un objeto con las claves done, flags e imprevistos." };
  }

  const { done, flags, imprevistos } = obj as Record<string, unknown>;

  const statusByKey: Record<string, ScheduleStatus> = {};
  if (done && typeof done === "object") {
    for (const [key, v] of Object.entries(done as Record<string, unknown>)) {
      const normalized = normalizeLegacyStatus(v);
      if (normalized) statusByKey[key] = normalized;
    }
  }

  const flagByKey: Record<string, boolean> = {};
  if (flags && typeof flags === "object") {
    for (const [key, v] of Object.entries(flags as Record<string, unknown>)) {
      if (v) flagByKey[key] = true;
    }
  }

  const imprevistosOut: Array<{ fecha: string; texto: string }> = [];
  if (Array.isArray(imprevistos)) {
    for (const item of imprevistos) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).fecha === "string" &&
        typeof (item as Record<string, unknown>).texto === "string"
      ) {
        imprevistosOut.push({
          fecha: (item as Record<string, unknown>).fecha as string,
          texto: (item as Record<string, unknown>).texto as string,
        });
      }
    }
  }

  return { ok: true, state: { statusByKey, flagByKey, imprevistos: imprevistosOut } };
}
