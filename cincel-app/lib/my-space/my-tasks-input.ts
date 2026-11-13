/**
 * Input schemas of Mi espacio's task reads (#1051): `getMyTasksSummary` and
 * `getMyTasksPage`. A module of its own: a `"use server"` file may export
 * only async functions.
 */
import { z } from "zod";

import { TAREAS_SEARCH_MAX } from "@/lib/tareas/query";
import { UuidSchema } from "@/lib/validation/project-flow";

/** Etapa keys (`workflows.key`) and `SIN_ETAPA_KEY`. */
const EtapaKey = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const MyTasksSummaryInputSchema = z
  .object({
    etapa: EtapaKey.nullable(),
    q: z.string().trim().max(TAREAS_SEARCH_MAX).nullable(),
    retraso: z.literal(true).optional(),
  })
  .strict();

export const MeTasksListFiltersSchema = z
  .object({
    proyecto: UuidSchema.optional(),
    etapa: EtapaKey.optional(),
    q: z.string().trim().max(TAREAS_SEARCH_MAX).optional(),
    retraso: z.literal(true).optional(),
    vence: z.enum(["hoy", "semana", "despues"]).optional(),
    cerradas: z.literal(true).optional(),
    orderBy: z.enum(["retraso", "vence"]).optional(),
  })
  .strict();
