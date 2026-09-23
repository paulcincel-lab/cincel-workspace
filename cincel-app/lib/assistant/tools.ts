import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  resolveActivitiesCapabilities,
  resolveClientsCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";
import { fetchProjectsAction, createProjectAction, applyWorkflowAction, deleteProjectAction } from "@/lib/actions/projects-actions";
import { fetchTasksAction, createUserTaskAction, assignTaskAction, mergeTasksAction } from "@/lib/actions/tasks-actions";
import { fetchContactsAction, createContactAction, mergeContactsAction } from "@/lib/actions/contacts-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { createGithubIssue, isGithubConfigured } from "@/lib/github/client";
import type {
  ContactKind,
  ProjectListItem,
  Staff,
  TaskListItem,
  TaskPriority,
  WorkflowDetail,
} from "@/lib/types/core";

/**
 * Every tool here goes through lib/actions/* — never straight to Drizzle
 * tables. Each action already re-checks the caller's session capability
 * server-side (throwing "FORBIDDEN: ..." or, for reads, returning an empty
 * result) so a tool can't be tricked into doing more than the caller's role
 * allows even if buildAssistantTools() below mis-gated it. Zod-validated
 * inputs; result counts capped where lists could get long.
 */

const RISK_NOTE =
  "riesgo derivado del avance y de tareas vencidas/bloqueadas (Alto/Medio/Bajo)";

// Firm departments / workflow slugs, matching lib/actividades/departamento.ts.
const WORKFLOW_ENUM = z.enum(["presale", "diseno", "construccion"]);
const ONBOARD_WORKFLOW_ENUM = WORKFLOW_ENUM;
const WORKFLOW_LABELS: Record<string, string> = {
  presale: "Presale",
  diseno: "Diseño",
  construccion: "Construcción",
};

// ── Name / key resolution helpers ────────────────────────────────────────────
// The assistant only ever knows people/projects by name (never by uuid), so
// every write tool has to resolve a name to an id first via the same read
// actions the UI uses, and report back candidates when the match isn't unique.

type Resolved<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; candidates?: string[] };

function byNameIlike<T extends { name: string }>(rows: T[], query: string): Resolved<T> {
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

async function resolveProject(name: string): Promise<Resolved<ProjectListItem>> {
  const rows = await fetchProjectsAction({ search: name });
  return byNameIlike(rows, name);
}

async function resolveStaff(name: string): Promise<Resolved<Staff>> {
  const rows = await fetchStaffAction();
  return byNameIlike(rows, name);
}

async function resolveWorkflowByKey(key: string): Promise<Resolved<WorkflowDetail>> {
  const rows = await fetchWorkflowsAction();
  const found = rows.find((w) => w.key === key);
  if (!found) return { ok: false, error: `No existe el flujo "${WORKFLOW_LABELS[key] ?? key}".` };
  return { ok: true, value: found };
}

export const list_projects = tool({
  description: `Lista proyectos de Cincel con su estado, etapa, avance y ${RISK_NOTE}. Filtra por estado, etapa o si están activos.`,
  inputSchema: z.object({
    activeOnly: z.boolean().default(true),
    stage: z.string().optional().describe("p. ej. Presale, Diseño, Construcción"),
    status: z.string().optional(),
  }),
  execute: async ({ activeOnly, stage, status }) => {
    const projects = await fetchProjectsAction({});

    // Per-project overdue / blocked open-task counts for the risk score.
    // projectId is a real FK now, so no name-snapshot fallback is needed.
    const today = new Date().toISOString().slice(0, 10);
    const openTasks = await fetchTasksAction({ status: ["pendiente", "en_proceso", "bloqueado"] });
    const byProject = new Map<string, { overdue: number; blocked: number }>();
    for (const t of openTasks) {
      const cur = byProject.get(t.projectId) ?? { overdue: 0, blocked: 0 };
      if (t.commitmentDate && t.commitmentDate < today) cur.overdue += 1;
      if (t.status === "bloqueado") cur.blocked += 1;
      byProject.set(t.projectId, cur);
    }

    return projects
      .filter((p) => (activeOnly ? p.status === "activo" : true))
      .filter((p) =>
        stage
          ? (p.currentWorkflow?.name ?? "").toLowerCase().includes(stage.toLowerCase()) ||
            (p.currentWorkflow?.key ?? "").toLowerCase().includes(stage.toLowerCase())
          : true
      )
      .filter((p) => (status ? p.status.toLowerCase() === status.toLowerCase() : true))
      .slice(0, 50)
      .map((p) => {
        const c = byProject.get(p.id) ?? { overdue: 0, blocked: 0 };
        const risk =
          c.blocked > 0 || c.overdue > 0 || p.progress < 45
            ? "Alto"
            : p.progress < 75
              ? "Medio"
              : "Bajo";
        return {
          name: p.name,
          status: p.status,
          stage: p.currentWorkflow?.name ?? null,
          progress: p.progress,
          active: p.status === "activo",
          overdueTasks: c.overdue,
          blockedTasks: c.blocked,
          risk,
        };
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
    let projectId: string | undefined;
    if (projectName) {
      const resolved = await resolveProject(projectName);
      if (!resolved.ok) return resolved;
      projectId = resolved.value.id;
    }

    let managerId: string | undefined;
    if (memberName) {
      const resolved = await resolveStaff(memberName);
      if (!resolved.ok) return resolved;
      managerId = resolved.value.id;
    }

    const today = new Date();
    const end = new Date(today.getTime() + withinDays * 86_400_000).toISOString().slice(0, 10);
    const start = today.toISOString().slice(0, 10);

    const rows = await fetchTasksAction({
      projectId,
      managerId,
      status: onlyBlocked ? "bloqueado" : ["pendiente", "en_proceso", "bloqueado"],
      // A named project lists everything regardless of dates (freshly-created
      // tasks have no dates yet); otherwise scope to the window.
      dateFrom: onlyBlocked || projectName ? undefined : start,
      dateTo: onlyBlocked || projectName ? undefined : end,
    });

    return rows.slice(0, 80).map((t: TaskListItem) => ({
      description: t.title,
      project: t.project.name,
      workflow: t.workflow?.name ?? null,
      phase: t.phase,
      status: t.status,
      priority: t.priority,
      commitmentDate: t.commitmentDate,
      reviewDate: t.reviewDate,
      manager: t.manager?.name ?? null,
    }));
  },
});

export const team_workload_summary = tool({
  description:
    "Resumen de carga del equipo: por colaborador activo, su rol, capacidad, número de tareas activas asignadas y porcentaje de ocupación estimado. Útil para ver quién está saturado.",
  inputSchema: z.object({}),
  execute: async () => {
    const members = await fetchStaffAction();
    const openTasks = await fetchTasksAction({ status: ["pendiente", "en_proceso", "bloqueado"] });

    const byManager = new Map<string, number>();
    for (const t of openTasks) {
      if (!t.manager) continue;
      byManager.set(t.manager.id, (byManager.get(t.manager.id) ?? 0) + 1);
    }

    return members.slice(0, 100).map((m) => {
      const activeTasks = byManager.get(m.id) ?? 0;
      const cap = m.capacity > 0 ? m.capacity : 8;
      return {
        name: m.name,
        // Staff has no bulk "area" field (that lives in the areas join table,
        // one query per staff member) — role is the closest free-text field
        // available without an N+1 lookup for a summary tool like this one.
        role: m.role,
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

export const create_task = tool({
  description:
    "Crea una nueva tarea/actividad en Cincel (estado inicial 'pendiente') y opcionalmente le asigna un responsable. Úsalo solo cuando el usuario pida explícitamente crear o registrar trabajo. Verifica antes el nombre del proyecto y del responsable con list_projects / team_workload_summary; no los inventes.",
  inputSchema: z.object({
    description: z.string().min(3).describe("Qué hay que hacer"),
    project: z.string().min(2).describe("Nombre exacto del proyecto — toda tarea pertenece a un proyecto"),
    workflow: WORKFLOW_ENUM.describe("Flujo de trabajo"),
    manager: z.string().optional().describe("Nombre del responsable"),
    priority: z.enum(["alta", "media", "baja"]).default("media"),
    phase: z.string().optional(),
    commitmentDate: z.string().optional().describe("Fecha de entrega YYYY-MM-DD"),
    reviewDate: z.string().optional().describe("Fecha de revisión YYYY-MM-DD"),
  }),
  execute: async ({ description, project, workflow, manager, priority, phase, commitmentDate, reviewDate }) => {
    const projectResolved = await resolveProject(project);
    if (!projectResolved.ok) return projectResolved;

    const workflowResolved = await resolveWorkflowByKey(workflow);
    if (!workflowResolved.ok) return workflowResolved;

    let managerId: string | null = null;
    if (manager) {
      const managerResolved = await resolveStaff(manager);
      if (!managerResolved.ok) return managerResolved;
      managerId = managerResolved.value.id;
    }

    const task = await createUserTaskAction({
      projectId: projectResolved.value.id,
      title: description,
      workflowId: workflowResolved.value.id,
      phase,
      managerId,
      priority: priority as TaskPriority,
      commitmentDate,
      reviewDate,
    });

    return {
      ok: true as const,
      id: task.id,
      title: task.title,
      project: task.project.name,
      workflow: task.workflow?.name ?? null,
      manager: task.manager?.name ?? null,
      status: task.status,
      priority: task.priority,
    };
  },
});

export const assign_task = tool({
  description:
    "Reasigna el responsable de una tarea existente, localizándola por un fragmento de su título (y opcionalmente proyecto/flujo). Si hay 0 o varias coincidencias devuelve el motivo y los candidatos para que el usuario aclare.",
  inputSchema: z.object({
    descriptionContains: z.string().min(3).describe("Fragmento del título de la tarea"),
    manager: z.string().min(2).describe("Nuevo responsable"),
    workflow: WORKFLOW_ENUM.optional(),
    project: z.string().optional(),
  }),
  execute: async ({ descriptionContains, manager, workflow, project }) => {
    let projectId: string | undefined;
    if (project) {
      const resolved = await resolveProject(project);
      if (!resolved.ok) return resolved;
      projectId = resolved.value.id;
    }

    let workflowId: string | undefined;
    if (workflow) {
      const resolved = await resolveWorkflowByKey(workflow);
      if (!resolved.ok) return resolved;
      workflowId = resolved.value.id;
    }

    const matches = await fetchTasksAction({ search: descriptionContains, projectId, workflowId });
    if (matches.length === 0) {
      return { ok: false as const, error: `No se encontró ninguna tarea que contenga "${descriptionContains}".` };
    }
    if (matches.length > 1) {
      return {
        ok: false as const,
        error: `"${descriptionContains}" es ambiguo, coincide con ${matches.length} tareas.`,
        candidates: matches.slice(0, 10).map((t) => `${t.title} (${t.project.name})`),
      };
    }

    const managerResolved = await resolveStaff(manager);
    if (!managerResolved.ok) return managerResolved;

    const task = await assignTaskAction(matches[0].id, managerResolved.value.id);
    return {
      ok: true as const,
      id: task.id,
      title: task.title,
      project: task.project.name,
      manager: task.manager?.name ?? null,
    };
  },
});

const CLIENT_KIND_ENUM = z.enum(["Empresa", "Particular"]);
const CLIENT_KIND_MAP: Record<z.infer<typeof CLIENT_KIND_ENUM>, ContactKind> = {
  Empresa: "empresa",
  Particular: "particular",
};

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
  execute: async ({ name, kind, phone, acquisitionChannel, contactName, contactEmail, contactPhone }) => {
    const contact = await createContactAction({
      type: "cliente",
      kind: CLIENT_KIND_MAP[kind],
      name,
      phone,
      acquisitionChannel,
      people: contactName
        ? [{ name: contactName, email: contactEmail ?? null, phone: contactPhone ?? null, isPrimary: true, role: null }]
        : undefined,
    });
    return { ok: true as const, id: contact.id, name: contact.name, kind: contact.kind };
  },
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
    workflow: ONBOARD_WORKFLOW_ENUM.default("presale"),
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
  execute: async ({
    name,
    kind,
    phone,
    acquisitionChannel,
    contactName,
    contactEmail,
    contactPhone,
    projectName,
    workflow,
    manager,
    extraTasks,
  }) => {
    const workflowResolved = await resolveWorkflowByKey(workflow);
    if (!workflowResolved.ok) return workflowResolved;

    let managerId: string | null = null;
    if (manager) {
      const managerResolved = await resolveStaff(manager);
      if (!managerResolved.ok) return managerResolved;
      managerId = managerResolved.value.id;
    }

    const contact = await createContactAction({
      type: "cliente",
      kind: CLIENT_KIND_MAP[kind],
      name,
      phone,
      acquisitionChannel,
      people: contactName
        ? [{ name: contactName, email: contactEmail ?? null, phone: contactPhone ?? null, isPrimary: true, role: null }]
        : undefined,
    });

    const project = await createProjectAction({
      name: projectName,
      clientId: contact.id,
      currentWorkflowId: workflowResolved.value.id,
      managerId,
    });

    const createdTasks = await applyWorkflowAction(project.id, workflowResolved.value.id, { managerId });

    for (const title of extraTasks ?? []) {
      await createUserTaskAction({
        projectId: project.id,
        title,
        workflowId: workflowResolved.value.id,
        managerId,
      });
    }

    return {
      ok: true as const,
      client: { id: contact.id, name: contact.name },
      project: { id: project.id, name: project.name },
      workflow: workflowResolved.value.name,
      tasksCreated: createdTasks.length + (extraTasks?.length ?? 0),
    };
  },
});

export const create_rfc = tool({
  description:
    "Redacta y registra una RFC (propuesta técnica o de producto) como un GitHub Issue etiquetado 'rfc' en el repositorio del proyecto. Úsalo solo cuando el usuario pida explícitamente escribir/registrar una RFC o propuesta formal. No inventes el problema ni la propuesta: pide al usuario que los describa si no los ha dado. Confirma el título antes de crearla — la acción es visible para todo el equipo de desarrollo en GitHub.",
  inputSchema: z.object({
    title: z.string().min(4).describe("Título corto de la RFC"),
    problem: z
      .string()
      .min(10)
      .describe("Qué problema u oportunidad motiva la RFC"),
    proposal: z.string().min(10).describe("La propuesta concreta"),
    alternatives: z
      .string()
      .optional()
      .describe("Alternativas consideradas y por qué se descartaron"),
    labels: z
      .array(z.string())
      .max(5)
      .optional()
      .describe("Etiquetas adicionales de GitHub, además de 'rfc'"),
  }),
  execute: async ({ title, problem, proposal, alternatives, labels }) => {
    if (!isGithubConfigured()) {
      return {
        ok: false as const,
        error:
          "GitHub no está configurado en este entorno (falta GITHUB_PAT / GITHUB_REPO).",
      };
    }

    const body = [
      "## Problema",
      problem,
      "",
      "## Propuesta",
      proposal,
      alternatives ? `\n## Alternativas consideradas\n${alternatives}` : "",
      "",
      "_Generado desde el asistente de Cincel Workspace._",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const issue = await createGithubIssue({
      title: `[RFC] ${title}`,
      body,
      labels: ["rfc", ...(labels ?? [])],
    });

    return { ok: true as const, number: issue.number, url: issue.url };
  },
});

export const find_duplicates = tool({
  description:
    "Escanea la base de datos en busca de registros duplicados: clientes con el mismo nombre y tareas idénticas en el mismo proyecto/flujo. Solo lectura — devuelve los grupos para que el usuario decida.",
  inputSchema: z.object({}),
  execute: async () => {
    const contacts = await fetchContactsAction({});
    const contactGroups = new Map<string, string[]>();
    for (const c of contacts) {
      const key = c.name.trim().toLowerCase();
      contactGroups.set(key, [...(contactGroups.get(key) ?? []), c.id]);
    }
    const duplicateClients = [...contactGroups.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([name, ids]) => ({ name, count: ids.length }));

    const tasks = await fetchTasksAction({});
    const taskGroups = new Map<string, { project: string; workflow: string | null; title: string; count: number }>();
    for (const t of tasks) {
      const key = `${t.projectId}::${t.workflowId ?? ""}::${t.title.trim().toLowerCase()}`;
      const cur = taskGroups.get(key);
      if (cur) {
        cur.count += 1;
      } else {
        taskGroups.set(key, { project: t.project.name, workflow: t.workflow?.name ?? null, title: t.title, count: 1 });
      }
    }
    const duplicateActivities = [...taskGroups.values()].filter((g) => g.count > 1);

    return {
      duplicateClients,
      duplicateActivities,
      // Dropped: "repeated member in the same project" detection. It existed
      // pre-rebuild but there's no bulk repository query for project
      // membership across all projects in the new layer (only per-project via
      // fetchProjectAction), and looping fetchProjectAction over every
      // project just for this check is an N+1 this read-only scan shouldn't
      // pay for. Bring it back once a projects-repository helper exists that
      // lists (projectId, staffId) duplicates directly.
      note:
        "No incluye colaboradores repetidos dentro de un mismo proyecto — ver comentario en el código.",
    };
  },
});

const CONTACT_TYPE_ENUM = z.enum(["cliente", "socio", "proveedor"]);

export const merge_duplicate_clients = tool({
  description:
    "Fusiona contactos duplicados (clientes/socios/proveedores) que comparten el mismo nombre exacto: conserva el más antiguo, reasigna proyectos/personas/tags/historial de los demás y los elimina de forma reversible. Usa find_duplicates primero para ver los grupos. Pide confirmación explícita antes de usarlo — es destructivo para los registros perdedores.",
  inputSchema: z.object({
    name: z.string().min(2).describe("Nombre exacto del contacto duplicado"),
    type: CONTACT_TYPE_ENUM.optional().describe(
      "Tipo del contacto si hay duplicados de más de un tipo con ese nombre"
    ),
  }),
  execute: async ({ name, type }) => {
    const all = await fetchContactsAction(type ? { type } : {});
    const q = name.trim().toLowerCase();
    const matches = all.filter((c) => c.name.trim().toLowerCase() === q);
    if (matches.length < 2) {
      return {
        ok: false as const,
        error: `No se encontraron al menos 2 contactos llamados "${name}"${type ? ` de tipo ${type}` : ""}.`,
      };
    }
    const groups = new Map<string, typeof matches>();
    for (const c of matches) groups.set(c.type, [...(groups.get(c.type) ?? []), c]);
    const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
    if (dupGroups.length === 0) {
      return {
        ok: false as const,
        error: `"${name}" coincide con varios contactos pero de tipos distintos, ninguno duplicado entre sí.`,
      };
    }
    if (dupGroups.length > 1) {
      return {
        ok: false as const,
        error: `"${name}" tiene duplicados en más de un tipo (${dupGroups.map(([t]) => t).join(", ")}). Especifica el tipo.`,
      };
    }
    const [, group] = dupGroups[0];
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const [keep, ...duplicates] = sorted;
    const merged = await mergeContactsAction(
      keep.id,
      duplicates.map((d) => d.id)
    );
    return {
      ok: true as const,
      keptId: merged.id,
      name: merged.name,
      type: merged.type,
      mergedCount: duplicates.length,
    };
  },
});

export const merge_duplicate_activities = tool({
  description:
    "Fusiona tareas duplicadas (mismo proyecto/flujo y título exacto): conserva la más antigua, reasigna checklist/apoyo/historial de las demás y las elimina de forma reversible. Usa find_duplicates primero para ver los grupos. Pide confirmación explícita antes de usarlo — es destructivo para los registros perdedores.",
  inputSchema: z.object({
    projectName: z.string().min(2),
    descriptionContains: z.string().min(3).describe("Título (o fragmento) de la tarea duplicada"),
    workflow: WORKFLOW_ENUM.optional(),
  }),
  execute: async ({ projectName, descriptionContains, workflow }) => {
    const resolved = await resolveProject(projectName);
    if (!resolved.ok) return resolved;

    let workflowId: string | undefined;
    if (workflow) {
      const resolvedWorkflow = await resolveWorkflowByKey(workflow);
      if (!resolvedWorkflow.ok) return resolvedWorkflow;
      workflowId = resolvedWorkflow.value.id;
    }

    const matches = await fetchTasksAction({
      search: descriptionContains,
      projectId: resolved.value.id,
      workflowId,
    });
    if (matches.length < 2) {
      return {
        ok: false as const,
        error: `No se encontraron al menos 2 tareas que contengan "${descriptionContains}" en "${resolved.value.name}".`,
      };
    }

    const groups = new Map<string, typeof matches>();
    for (const t of matches) {
      const key = t.title.trim().toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    const dupGroups = [...groups.values()].filter((g) => g.length > 1);
    if (dupGroups.length === 0) {
      return {
        ok: false as const,
        error: `"${descriptionContains}" coincide con varias tareas en "${resolved.value.name}" pero ninguna con título exactamente igual.`,
      };
    }
    if (dupGroups.length > 1) {
      return {
        ok: false as const,
        error: `"${descriptionContains}" tiene más de un grupo de tareas duplicadas en "${resolved.value.name}". Sé más específico.`,
        candidates: dupGroups.map((g) => g[0].title),
      };
    }

    const group = dupGroups[0];
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const [keep, ...duplicates] = sorted;
    const merged = await mergeTasksAction(
      keep.id,
      duplicates.map((d) => d.id)
    );
    return {
      ok: true as const,
      keptId: merged.id,
      title: merged.title,
      project: resolved.value.name,
      mergedCount: duplicates.length,
    };
  },
});

export const discard_project = tool({
  description:
    "Descarta (archiva de forma reversible) un proyecto completo y TODAS sus tareas — útil para limpiar proyectos de prueba o de semilleo. No borra nada de forma permanente: las filas conservan su historial y se pueden restaurar. Pide confirmación explícita y el nombre exacto del proyecto antes de usarlo.",
  inputSchema: z.object({
    projectName: z.string().min(2).describe("Nombre exacto del proyecto a descartar"),
  }),
  execute: async ({ projectName }) => {
    const resolved = await resolveProject(projectName);
    if (!resolved.ok) return resolved;
    await deleteProjectAction(resolved.value.id);
    return { ok: true as const, id: resolved.value.id, name: resolved.value.name };
  },
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
 * are always available; the write tools are gated by the same capabilities
 * the corresponding UI enforces:
 * - create_task              → canCreateActivity
 * - assign_task              → canChangeResponsible
 * - create_client            → canCreateClient
 * - onboard_client           → canCreateClient AND canCreateActivity
 * - create_rfc               → canCreateActivity (same tier as create_task —
 *   RFCs are proposals, not destructive; gate is about "can write", not rank)
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
  if (activitiesCaps.canCreateActivity) tools.create_rfc = create_rfc;
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
