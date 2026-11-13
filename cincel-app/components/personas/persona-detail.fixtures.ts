import type { PersonaActivityItem, PersonaDetail } from "@/lib/types/redesign";
import type { AttentionItem } from "@/lib/types/widgets";

/** Title of the admin-only task of the fixture (`kind = 'admin'` on the server). */
export const ADMIN_TASK_TITLE = "Conciliar facturas de proveedores";

const visibleTasks: AttentionItem[] = [
  {
    id: "t-1",
    title: "Cambiar tapas a WC con rosca metálica",
    href: "/tareas?tarea=t-1",
    project: "Local Espinopapa",
    etapa: "construccion",
    reason: "Vencida",
    tone: "critical",
    assignee: { id: "s-paul", name: "Paul Langarica", initials: "PL" },
    due: "2026-09-29",
    daysLate: 39,
  },
  {
    id: "t-2",
    title: "Medir muro del fondo de cocina",
    href: "/tareas?tarea=t-2",
    project: "Ensenada",
    etapa: "construccion",
    reason: "Vence hoy",
    tone: "warn",
    assignee: { id: "s-paul", name: "Paul Langarica", initials: "PL" },
    due: "2026-11-07",
    daysLate: null,
  },
];

const adminTask: AttentionItem = {
  id: "t-admin",
  title: ADMIN_TASK_TITLE,
  href: "/tareas?tarea=t-admin",
  project: "Administración",
  etapa: null,
  reason: "Vence pronto",
  tone: "warn",
  assignee: { id: "s-paul", name: "Paul Langarica", initials: "PL" },
  due: "2026-11-10",
  daysLate: null,
};

/** Activity text of the admin-only item of the fixture (an event on the admin task). */
export const ADMIN_ACTIVITY_TEXT = `Comentó en “${ADMIN_TASK_TITLE}”`;

/** "Actividad reciente" rows of frame `PersonaDetalle`. */
const visibleActivity: PersonaActivityItem[] = [
  { id: "a-1", text: "Movió “Instalación eléctrica” a 90%", at: "2026-11-07T16:12:00.000Z", when: "hoy 10:12", href: "/proyectos/pr-1" },
  { id: "a-2", text: "Subió 3 fotos a la bitácora de Casa Lomas", at: "2026-11-06T23:40:00.000Z", when: "ayer 17:40", href: "/proyectos/pr-3" },
  { id: "a-3", text: "Comentó en “Carpeta de proyecto terminado”", at: "2026-11-06T18:05:00.000Z", when: "ayer 12:05", href: "/tareas?tarea=t-3" },
];

const adminActivity: PersonaActivityItem = {
  id: "a-admin",
  text: ADMIN_ACTIVITY_TEXT,
  at: "2026-11-06T15:00:00.000Z",
  when: "ayer 9:00",
  href: "/tareas?tarea=t-admin",
};

/**
 * `fetchPersonaDetailAction` output as the server returns it for one viewer:
 * the admin task (and its activity row) only with `canSeeAdminData`, `weekHours` only for
 * `canViewTeamHours` or self (BE §7.11).
 */
export function personaDetailFixture(viewer: { canSeeAdminData: boolean; canViewHours: boolean }): PersonaDetail {
  const tasks = viewer.canSeeAdminData ? [...visibleTasks, adminTask] : visibleTasks;
  return {
    staff: {
      id: "s-paul",
      kind: "empleado",
      name: "Paul",
      lastName: "Langarica Soubic",
      phone: "+52 646 000 0000",
      email: "paul@cincel.example",
      role: "Colaborador",
      capacity: 10,
      availability: null,
      active: true,
      createdAt: "2026-01-05T16:00:00.000Z",
      updatedAt: "2026-11-01T16:00:00.000Z",
      googleManaged: false,
      lastLoginAt: null,
      accessRevokedAt: null,
      accessRevokedReason: null,
      positions: [{ id: "p-res", name: "Residente de obra" }],
      candidatePhases: [],
    },
    person: {
      id: "s-paul",
      name: "Paul Langarica",
      initials: "PL",
      photoUrl: null,
      puesto: "Residente de obra",
      etapa: "construccion",
      open: tasks.length,
      overdue: 1,
      activeProjects: 2,
      occupancyPct: 80,
      weekHours: viewer.canViewHours ? 41.5 : null,
    },
    stats: [
      { key: "abiertas", label: "Tareas abiertas", value: tasks.length },
      { key: "vencidas", label: "Vencidas", value: 1 },
      ...(viewer.canViewHours ? [{ key: "horas_semana", label: "Horas esta semana", value: 41.5, display: "41.5 h" }] : []),
      { key: "proyectos_activos", label: "Proyectos activos", value: 2 },
    ],
    projects: [
      { id: "pr-1", label: "Local Espinopapa", sublabel: "responsable", real: 82, href: "/proyectos/pr-1" },
      { id: "pr-2", label: "Ensenada", sublabel: "miembro", real: 64, href: "/proyectos/pr-2" },
    ],
    tasks,
    weekHours: viewer.canViewHours
      ? [
          { date: "2026-11-02", hours: 8.5 },
          { date: "2026-11-03", hours: 9 },
          { date: "2026-11-04", hours: 8 },
          { date: "2026-11-05", hours: 8 },
          { date: "2026-11-06", hours: 8 },
        ]
      : null,
    availability: ["ocupado", "saturado", "saturado", "ocupado", "libre"],
    recentActivity: viewer.canSeeAdminData ? [...visibleActivity, adminActivity] : visibleActivity,
  };
}
