import "server-only";

import { recordComment } from "@/lib/repositories/history-repository";
import type { HistoryEvent } from "@/lib/types/core";

/** The suffix that marks a bitácora entry written by an assistant tool (BE §9.9). */
export const VIA_ASISTENTE = "(vía asistente)";

/** Entities whose bitácora is shared with the team (BE §9.9). Owner-only entities never get a row. */
export type SharedHistoryEntity = "task" | "project" | "contact" | "staff";

/** `text` with the "(vía asistente)" suffix, once. */
export function viaAsistente(text: string): string {
  const clean = text.trim();
  return clean.endsWith(VIA_ASISTENTE) ? clean : `${clean} ${VIA_ASISTENTE}`;
}

/**
 * Appends the `comentario` that records an assistant write on a shared entity
 * (BE §9.9): `comment = "<summary> (vía asistente)"`, `actor_id` = the user.
 */
export async function recordViaAsistente(input: {
  entity: SharedHistoryEntity;
  entityId: string;
  actorId: string;
  summary: string;
}): Promise<HistoryEvent> {
  return recordComment({
    entity: input.entity,
    entityId: input.entityId,
    actorId: input.actorId,
    comment: viaAsistente(input.summary),
  });
}
