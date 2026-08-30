import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { activities, projects, teamMembers } from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  resolveActivitiesCapabilities,
  resolveClientsCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";
import {
  assignActivityViaAssistantAction,
  createActivityViaAssistantAction,
} from "@/lib/actions/activities-actions";
import {
  createClientViaAssistantAction,
  onboardClientViaAssistantAction,
} from "@/lib/actions/clients-actions";
import {
  discardProjectViaAssistantAction,
  findDuplicatesAction,
  mergeDuplicateActivitiesAction,
  mergeDuplicateClientsAction,
} from "@/lib/actions/maintenance-actions";

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
        id: projects.id,
        name: projects.name,
        status: projects.status,
        stage: projects.stage,
        progress: projects.progress,
        active: projects.active,
      })
      .from(projects)
      .where(where)
      .limit(50);

    // Per-project overdue / blocked activity counts for the risk score. Grouped
    // by project_id (ADR 0001) with a name-snapshot fallback for tasks whose
    // project didn't resolve to an id.
    const today = new Date().toISOString().slice(0, 10);
    const counts = await db
      .select({
        projectId: activities.projectId,
        project: activities.projectNameSnapshot,
        overdue: sql<number>`count(*) filter (where ${activities.commitmentDate} < ${today} and ${activities.status} <> 'Completado')`,
        blocked: sql<number>`count(*) filter (where ${activities.status} = 'Bloqueado')`,
      })
      .from(activities)
      .where(and(isNull(activities.deletedAt), eq(activities.archived, false)))
      .groupBy(activities.projectId, activities.projectNameSnapshot);

    const byId = new Map<string, { overdue: number; blocked: number }>();
    const byName = new Map<string, { overdue: number; blocked: number }>();
    for (const c of counts) {
      const v = { overdue: Number(c.overdue ?? 0), blocked: Number(c.blocked ?? 0) };
      if (c.projectId) {
        const cur = byId.get(c.projectId) ?? { overdue: 0, blocked: 0 };
        byId.set(c.projectId, {
          overdue: cur.overdue + v.overdue,
          blocked: cur.blocked + v.blocked,
        });
      } else if (c.project) {
        const cur = byName.get(c.project) ?? { overdue: 0, blocked: 0 };
        byName.set(c.project, {
          overdue: cur.overdue + v.overdue,
          blocked: cur.blocked + v.blocked,
        });
      }
    }

    return rows.map((p) => {
      const c = byId.get(p.id) ?? byName.get(p.name);
      const overdue = Number(c?.overdue ?? 0);
      const blocked = Number(c?.blocked ?? 0);
      const risk =
        blocked > 0 || overdue > 0 || p.progress < 45
          ? "Alto"
          : p.progress < 75
            ? "Medio"
            : "Bajo";
      const { id: _id, ...rest } = p;
      void _id;
      return { ...rest, overdueTasks: overdue, blockedTasks: blocked, risk };
    });
  },
});

export const list_activities_due = tool({
  description:
    "Lista actividades/tareas no completadas. Por defecto solo las que tienen entrega (commitmentDate) o revisión (reviewDate) dentro de una ventana de días, o las bloqueadas. Si indicas projectName, lista TODAS las tareas de ese proyecto tengan fecha o no (útil para revisar o secuenciar un proyecto recién creado). Filtra también por responsable.",
  inputSchema: z.object({
    withinDays: z.number().int().min(1).max(60).default(7),
    memberName: z.string().optional(),
    projectName: z
      .string()
      .optional()
      .describe("Al indicarlo se ignora la ventana de fechas y se listan todas las tareas del proyecto"),
    onlyBlocked: z.boolean().default(false),
  }),
  execute: async ({ withinDays, memberName, projectName, onlyBlocked }) => {
    const today = new Date();
    const end = new Date(today.getTime() + withinDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const start = today.toISOString().slice(0, 10);

    const dateWindow = or(
      and(gte(activities.commitmentDate, start), lte(activities.commitmentDate, end)),
      and(gte(activities.reviewDate, start), lte(activities.reviewDate, end))
    );

    // Scope: blocked-only wins; then a named project lists everything (no date
    // filter — freshly-created tasks have no dates yet); otherwise the window.
    const scope = onlyBlocked
      ? eq(activities.status, "Bloqueado")
      : projectName
        ? undefined
        : dateWindow;

    const rows = await db
      .select({
        description: activities.description,
        project: activities.projectNameSnapshot,
        workflow: activities.workflow,
        phase: activities.phase,
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
          scope,
          projectName
            ? sql`${activities.projectNameSnapshot} ilike ${`%${projectName}%`}`
            : undefined,
          memberName
            ? sql`${activities.managerNameSnapshot} ilike ${`%${memberName}%`}`
            : undefined
        )
      )
      .orderBy(asc(activities.commitmentDate), asc(activities.reviewDate))
      .limit(80);

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

// Semantic tone for the small widgets below — separate from the chart's blue
// accent. Matches the Alto/Medio/Bajo risk convention used elsewhere in the
// app (ok=green, warning=amber, critical=red), left for the frontend to map.
const TONE_ENUM = z.enum(["ok", "warning", "critical"]);

export const render_card = tool({
  description:
    "Renderiza una tarjeta con el estado de UNA sola entidad (un proyecto, un cliente, una persona) en la conversación: título, subtítulo opcional, una lista de campo/valor y una insignia de estado opcional. Úsalo para respuestas de una sola entidad en vez de un párrafo — p. ej. '¿cómo va Ensenada?'.",
  inputSchema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    fields: z.array(z.object({ label: z.string(), value: z.string() })).max(10),
    badge: z.object({ label: z.string(), tone: TONE_ENUM }).optional(),
  }),
  // Same no-op pattern as render_chart — the frontend renders from part.input.
  execute: async () => {
    return { ok: true } as const;
  },
});

export const render_stat_grid = tool({
  description:
    "Renderiza una cuadrícula de varias métricas cortas en la conversación — para comparar VARIAS entidades o cifras sin necesitar una tendencia (eso es render_chart). Úsalo p. ej. para 'compara el avance de los proyectos activos' cuando no hace falta un gráfico.",
  inputSchema: z.object({
    title: z.string().optional(),
    stats: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          badge: z.object({ label: z.string(), tone: TONE_ENUM }).optional(),
        })
      )
      .max(6),
  }),
  execute: async () => {
    return { ok: true } as const;
  },
});

export const render_list = tool({
  description:
    "Renderiza una lista corta con título en la conversación — para una enumeración simple (p. ej. qué falta en el checklist de una tarea) que no necesita ser una tabla ni un gráfico.",
  inputSchema: z.object({
    title: z.string(),
    items: z.array(z.string()).min(1).max(20),
  }),
  execute: async () => {
    return { ok: true } as const;
  },
});

const WORKFLOW_ENUM = z.enum(["Presale", "Diseño", "Construcción"]);

export const create_task = tool({
  description:
    "Crea una nueva tarea/actividad en Cincel (estado inicial 'Pendiente') y opcionalmente le asigna un responsable. Úsalo solo cuando el usuario pida explícitamente crear o registrar trabajo. Verifica antes el nombre del proyecto y del responsable con list_projects / team_workload_summary; no los inventes.",
  inputSchema: z.object({
    description: z.string().min(3).describe("Qué hay que hacer"),
    workflow: WORKFLOW_ENUM.describe("Flujo de trabajo"),
    project: z.string().optional().describe("Nombre exacto del proyecto"),
    manager: z.string().optional().describe("Nombre del responsable"),
    priority: z.enum(["Alta", "Media", "Baja"]).default("Media"),
    phase: z.string().optional(),
    commitmentDate: z.string().optional().describe("Fecha de entrega YYYY-MM-DD"),
    reviewDate: z.string().optional().describe("Fecha de revisión YYYY-MM-DD"),
  }),
  execute: async (input) => createActivityViaAssistantAction(input),
});

export const assign_task = tool({
  description:
    "Reasigna el responsable de una tarea existente, localizándola por un fragmento de su descripción (y opcionalmente proyecto/flujo). Si hay 0 o varias coincidencias devuelve el motivo y los candidatos para que el usuario aclare.",
  inputSchema: z.object({
    descriptionContains: z
      .string()
      .min(3)
      .describe("Fragmento de la descripción de la tarea"),
    manager: z.string().min(2).describe("Nuevo responsable"),
    workflow: WORKFLOW_ENUM.optional(),
    project: z.string().optional(),
  }),
  execute: async (input) => assignActivityViaAssistantAction(input),
});

const CLIENT_KIND_ENUM = z.enum(["Empresa", "Particular"]);

export const create_client = tool({
  description:
    "Da de alta un nuevo cliente en Cincel (sin proyecto ni tareas). Úsalo solo cuando el usuario pida explícitamente registrar un cliente. Confirma antes el nombre y el tipo (Empresa/Particular).",
  inputSchema: z.object({
    name: z.string().min(2).describe("Nombre del cliente"),
    kind: CLIENT_KIND_ENUM.default("Particular"),
    phone: z.string().optional(),
    acquisitionChannel: z
      .string()
      .optional()
      .describe("Cómo llegó el cliente, p. ej. Referido, Instagram"),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
  }),
  execute: async (input) => createClientViaAssistantAction(input),
});

export const onboard_client = tool({
  description:
    "Da de alta un nuevo cliente y, en el mismo paso, crea el checklist estándar de tareas del flujo elegido (Presale por defecto) para un proyecto nuevo. Úsalo cuando el usuario quiera 'arrancar' un cliente/proyecto. Confirma antes el nombre del cliente, el nombre del proyecto y el flujo.",
  inputSchema: z.object({
    name: z.string().min(2).describe("Nombre del cliente"),
    kind: CLIENT_KIND_ENUM.default("Particular"),
    phone: z.string().optional(),
    acquisitionChannel: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    projectName: z.string().min(2).describe("Nombre del proyecto nuevo"),
    workflow: WORKFLOW_ENUM.default("Presale"),
    manager: z
      .string()
      .optional()
      .describe("Responsable para todas las tareas iniciales"),
    extraTasks: z
      .array(z.string())
      .max(20)
      .optional()
      .describe("Tareas adicionales fuera de la plantilla"),
  }),
  execute: async (input) => onboardClientViaAssistantAction(input),
});

export const find_duplicates = tool({
  description:
    "Escanea la base de datos en busca de registros duplicados: clientes con el mismo nombre, tareas idénticas en el mismo proyecto/flujo, y miembros repetidos en un proyecto. Solo lectura — devuelve los grupos para que el usuario decida.",
  inputSchema: z.object({}),
  execute: async () => findDuplicatesAction(),
});

export const merge_duplicate_clients = tool({
  description:
    "Fusiona todos los clientes activos que comparten un nombre (sin distinguir mayúsculas) en uno solo. Conserva el que tiene más proyectos; reasigna proyectos, contactos e historial al superviviente y archiva los demás. Pide confirmación antes de usarlo.",
  inputSchema: z.object({
    name: z.string().min(2).describe("Nombre del cliente duplicado"),
  }),
  execute: async (input) => mergeDuplicateClientsAction(input),
});

export const merge_duplicate_activities = tool({
  description:
    "Fusiona tareas duplicadas de un proyecto (misma descripción y flujo). Conserva la que tiene más bitácora; mueve historial, apoyos y checklist a esa y archiva las demás. Pide confirmación antes de usarlo.",
  inputSchema: z.object({
    projectName: z.string().min(2),
    descriptionContains: z.string().min(3),
    workflow: WORKFLOW_ENUM.optional(),
  }),
  execute: async (input) => mergeDuplicateActivitiesAction(input),
});

export const discard_project = tool({
  description:
    "Descarta (archiva de forma reversible) un proyecto completo y TODAS sus tareas — útil para limpiar proyectos de prueba o de semilleo. No borra nada de forma permanente: las filas conservan su historial y se pueden restaurar. Pide confirmación explícita y el nombre exacto del proyecto antes de usarlo.",
  inputSchema: z.object({
    projectName: z.string().min(2).describe("Nombre exacto del proyecto a descartar"),
  }),
  execute: async (input) => discardProjectViaAssistantAction(input),
});

export const ASSISTANT_TOOLS = {
  list_projects,
  list_activities_due,
  team_workload_summary,
  render_chart,
  render_card,
  render_stat_grid,
  render_list,
} as const;

/**
 * The tool set the assistant gets for a given caller. Read tools + render_chart
 * are always available; the write tools are gated by the same activities
 * capabilities the /tareas UI enforces:
 * - create_task              → canCreateActivity
 * - assign_task              → canChangeResponsible
 * - create_client            → canCreateClient
 * - onboard_client           → canCreateClient AND canCreateActivity
 * - find_duplicates          → canViewClients OR canViewActivities
 * - merge_duplicate_clients  → canDeleteClient
 * - merge_duplicate_activities → canDeleteActivity
 * - discard_project          → canDeleteProject
 */
export function buildAssistantTools(user: AuthenticatedUser | null): ToolSet {
  const activitiesCaps = resolveActivitiesCapabilities(user);
  const clientsCaps = resolveClientsCapabilities(user);
  const projectsCaps = resolveProjectsCapabilities(user);
  const tools: ToolSet = {
    list_projects,
    list_activities_due,
    team_workload_summary,
    render_chart,
    render_card,
    render_stat_grid,
    render_list,
  };
  if (activitiesCaps.canCreateActivity) tools.create_task = create_task;
  if (activitiesCaps.canChangeResponsible) tools.assign_task = assign_task;
  if (clientsCaps.canCreateClient) tools.create_client = create_client;
  if (clientsCaps.canCreateClient && activitiesCaps.canCreateActivity) {
    tools.onboard_client = onboard_client;
  }
  // Maintenance: everyone can scan; merging is destructive → delete capability.
  if (clientsCaps.canViewClients || activitiesCaps.canViewActivities) {
    tools.find_duplicates = find_duplicates;
  }
  if (clientsCaps.canDeleteClient) {
    tools.merge_duplicate_clients = merge_duplicate_clients;
  }
  if (activitiesCaps.canDeleteActivity) {
    tools.merge_duplicate_activities = merge_duplicate_activities;
  }
  if (projectsCaps.canDeleteProject) {
    tools.discard_project = discard_project;
  }
  return tools;
}
