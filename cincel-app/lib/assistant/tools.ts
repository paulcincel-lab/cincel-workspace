import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { and, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { activities, projects, teamMembers } from "@/lib/db/schema";

/**
 * Every tool here is read-only and only touches core.projects,
 * core.activities, core.team_members — never auth_credentials / sessions /
 * clients. Zod-validated inputs; selected columns are whitelisted and result
 * counts capped.
 */

const RISK_NOTE =
  "riesgo derivado del avance y de tareas vencidas/bloqueadas (Alto/Medio/Bajo)";

export const list_projects = tool({
  description: `Lista proyectos de Cincel con su estado, etapa, avance y ${RISK_NOTE}. Filtra por estado, etapa o si están activos.`,
  inputSchema: z.object({
    activeOnly: z.boolean().default(true),
    stage: z.string().optional().describe("p. ej. Presale, Diseño, Construcción"),
    status: z.string().optional(),
  }),
  execute: async ({ activeOnly, stage, status }) => {
    const where = and(
      isNull(projects.deletedAt),
      activeOnly ? eq(projects.active, true) : undefined,
      stage ? sql`${projects.stage} ilike ${`%${stage}%`}` : undefined,
      status ? eq(projects.status, status) : undefined
    );

    const rows = await db
      .select({
        name: projects.name,
        status: projects.status,
        stage: projects.stage,
        progress: projects.progress,
        active: projects.active,
      })
      .from(projects)
      .where(where)
      .limit(50);

    // Per-project overdue / blocked activity counts for the risk score.
    const today = new Date().toISOString().slice(0, 10);
    const counts = await db
      .select({
        project: activities.projectNameSnapshot,
        overdue: sql<number>`count(*) filter (where ${activities.commitmentDate} < ${today} and ${activities.status} <> 'Completado')`,
        blocked: sql<number>`count(*) filter (where ${activities.status} = 'Bloqueado')`,
      })
      .from(activities)
      .where(and(isNull(activities.deletedAt), eq(activities.archived, false)))
      .groupBy(activities.projectNameSnapshot);

    const byName = new Map(counts.map((c) => [c.project ?? "", c]));

    return rows.map((p) => {
      const c = byName.get(p.name);
      const overdue = Number(c?.overdue ?? 0);
      const blocked = Number(c?.blocked ?? 0);
      const risk =
        blocked > 0 || overdue > 0 || p.progress < 45
          ? "Alto"
          : p.progress < 75
            ? "Medio"
            : "Bajo";
      return { ...p, overdueTasks: overdue, blockedTasks: blocked, risk };
    });
  },
});

export const list_activities_due = tool({
  description:
    "Lista actividades/tareas con entrega (commitmentDate) o revisión (reviewDate) dentro de una ventana de días, o tareas bloqueadas. Filtra por responsable.",
  inputSchema: z.object({
    withinDays: z.number().int().min(1).max(60).default(7),
    memberName: z.string().optional(),
    onlyBlocked: z.boolean().default(false),
  }),
  execute: async ({ withinDays, memberName, onlyBlocked }) => {
    const today = new Date();
    const end = new Date(today.getTime() + withinDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const start = today.toISOString().slice(0, 10);

    const dateWindow = or(
      and(gte(activities.commitmentDate, start), lte(activities.commitmentDate, end)),
      and(gte(activities.reviewDate, start), lte(activities.reviewDate, end))
    );

    const rows = await db
      .select({
        description: activities.description,
        project: activities.projectNameSnapshot,
        workflow: activities.workflow,
        status: activities.status,
        priority: activities.priority,
        commitmentDate: activities.commitmentDate,
        reviewDate: activities.reviewDate,
        manager: activities.managerNameSnapshot,
      })
      .from(activities)
      .where(
        and(
          isNull(activities.deletedAt),
          eq(activities.archived, false),
          ne(activities.status, "Completado"),
          onlyBlocked ? eq(activities.status, "Bloqueado") : dateWindow,
          memberName
            ? sql`${activities.managerNameSnapshot} ilike ${`%${memberName}%`}`
            : undefined
        )
      )
      .limit(60);

    return rows;
  },
});

export const team_workload_summary = tool({
  description:
    "Resumen de carga del equipo: por colaborador activo, su área, capacidad, número de tareas activas asignadas y porcentaje de ocupación estimado. Útil para ver quién está saturado.",
  inputSchema: z.object({}),
  execute: async () => {
    const members = await db
      .select({
        name: teamMembers.name,
        area: teamMembers.area,
        capacity: teamMembers.capacity,
      })
      .from(teamMembers)
      .where(and(isNull(teamMembers.deletedAt), eq(teamMembers.active, true)))
      .limit(100);

    const load = await db
      .select({
        manager: activities.managerNameSnapshot,
        activeTasks: sql<number>`count(*)`,
      })
      .from(activities)
      .where(
        and(
          isNull(activities.deletedAt),
          eq(activities.archived, false),
          ne(activities.status, "Completado")
        )
      )
      .groupBy(activities.managerNameSnapshot);

    const byManager = new Map(
      load.map((l) => [l.manager ?? "", Number(l.activeTasks)])
    );

    return members.map((m) => {
      const activeTasks = byManager.get(m.name) ?? 0;
      const cap = m.capacity > 0 ? m.capacity : 8;
      return {
        name: m.name,
        area: m.area,
        capacity: m.capacity,
        activeTasks,
        occupancyPct: Math.round((activeTasks / cap) * 100),
      };
    });
  },
});

export const render_chart = tool({
  description:
    "Renderiza un gráfico de barras o de línea en la conversación con los datos proporcionados. Úsalo cuando un gráfico aclare la respuesta en vez de describir los datos solo en texto.",
  inputSchema: z.object({
    chartType: z.enum(["bar", "line"]),
    title: z.string(),
    data: z.array(z.object({ label: z.string(), value: z.number() })).max(30),
  }),
  // No DB access — hands structured chart data to the frontend, which renders
  // a recharts component from `part.input`. The model still needs a result to
  // continue, hence the acknowledgement.
  execute: async () => {
    return { ok: true } as const;
  },
});

export const ASSISTANT_TOOLS = {
  list_projects,
  list_activities_due,
  team_workload_summary,
  render_chart,
} as const;
