/**
 * `getTareasPageData` / `getTareasListPage` / `getTareasBoardColumn` input
 * schemas (Query Migration 4a, #955). A module of its own: a `"use server"`
 * file may export only async functions.
 */
import { z } from "zod";

import { UuidSchema } from "@/lib/validation/project-flow";

import { TAREAS_MOSTRAR, TAREAS_SEARCH_MAX } from "./query";
import { TASK_SORT_COLUMNS } from "./sort";

/** Most projects the Proyecto multi-select sends (#1045). */
export const TAREAS_PROYECTOS_MAX = 50;

/** Tramo keys (`workflows.key`), as `parseTareasQuery` keeps them. */
const TramoKey = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const TareasFilterFields = {
  tramo: TramoKey.nullable(),
  proyecto: UuidSchema.nullable(),
  responsable: z.union([z.literal("yo"), z.literal("todos"), UuidSchema]).nullable(),
  estado: z.enum(["pendiente", "en_proceso", "completado", "bloqueado"]).nullable(),
  q: z.string().max(TAREAS_SEARCH_MAX).nullable(),
  /** Left out for "todas" (`TareasListFilters.mostrar`). */
  mostrar: z.enum(TAREAS_MOSTRAR).optional(),
  /** "Incluir apoyo" off; left out when on (`TareasListFilters.apoyo`). */
  apoyo: z.literal(false).optional(),
  /** Proyecto multi-select (#1045, `TareasListFilters.proyectos`). */
  proyectos: z.array(UuidSchema).max(TAREAS_PROYECTOS_MAX).optional(),
  /** Subtasks as rows of their own; left out for top-level only (#1047). */
  topLevelOnly: z.literal(false).optional(),
};

/** The sort column and direction (#1044); left out for the default order. */
const SortFields = {
  orderBy: z.enum(TASK_SORT_COLUMNS).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
};

/** The URL filters every view shares (`TareasListFilters`). */
export const TareasListFiltersSchema = z.object(TareasFilterFields);

/** One `/tareas` layout (the resolved style): no `cursor` / `limit`, they are not part of `qk.tareas.page`. */
export const TareasPageInput = z.object({
  estilo: z.enum(["visual", "esencial", "analitico"]),
  ...TareasFilterFields,
  ...SortFields,
});

/** Opaque keyset cursors are base64url. */
const Cursor = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/)
  .nullable();

export const TareasListPageInput = z.object({
  filters: TareasListFiltersSchema,
  cursor: Cursor,
  limit: z.number().int().min(10).max(200).optional(),
  /** "retraso" (Analítico tramo groups): overdue first, then open by due date, then closed; any other column (#1044). */
  ...SortFields,
});

/** A board column: a base status or `custom:<uuid>`. */
const BoardColumnId = z.union([
  z.enum(["pendiente", "en_proceso", "completado", "bloqueado"]),
  z.string().regex(/^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
]);

export const TareasBoardColumnInput = z.object({
  filters: TareasListFiltersSchema,
  columnId: BoardColumnId,
  cursor: Cursor,
});

export const TareasFiltersInput = z.object({ filters: TareasListFiltersSchema });
