/**
 * Data the day and week summaries read (Calendario BE §10.1). Server-only.
 *
 * Three task sets, merged by id: the viewer's open tasks due up to the end of the
 * range; blocked open tasks with an open successor in the viewer's projects; and
 * overdue open tasks of the projects of the viewer's meetings. Each task carries its
 * open dependents (successors in `task_dependencies`, waiting subtasks) and, when
 * blocked, the org-local date of its last change to `bloqueado`.
 */
import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData } from "@/lib/auth/permissions";
import { TASK_TREND_TIME_ZONE } from "@/lib/dashboard/task-trend";
import { db } from "@/lib/db/client";
import { addDays } from "@/lib/time-tracking/local-time";
import { eventItemsInRange } from "@/lib/repositories/calendario-events-range";
import type { SummaryDependent, SummaryTask } from "@/lib/calendario/risk";
import type { CalEventItem } from "@/lib/types/calendario";
import type { TaskStatus } from "@/lib/types/core";

const TASK_CAP = 500;
const MEETING_LOOKAHEAD_DAYS = 7;

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  date: string;
  project_id: string | null;
  project_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
};

type DependentRow = {
  parent_id: string;
  id: string;
  title: string;
  date: string | null;
  manager_id: string | null;
  manager_name: string | null;
  via: "dependency" | "subtask";
};

export type SummaryData = {
  tasks: SummaryTask[];
  meetings: CalEventItem[];
  oldestOverdue: Map<string, { title: string; date: string }>;
};

function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

const TZ = sql.raw(`'${TASK_TREND_TIME_ZONE}'`);

/** An open, live task `t` with a due date. Admin tasks only for administrators. */
function openTask(isAdmin: boolean): SQL {
  return sql`t.deleted_at is null and t.archived = false and t.closed_at is null and t.status <> 'completado'
    and coalesce(t.commitment_date, t.delivery_date) is not null
    and ${isAdmin ? sql`true` : sql`t.kind <> 'admin'`}
    and exists (select 1 from core.projects p where p.id = t.project_id and p.deleted_at is null)`;
}

const DUE = sql`to_char(coalesce(t.commitment_date, t.delivery_date), 'YYYY-MM-DD')`;

const TASK_COLUMNS = sql`t.id, t.title, t.status, ${DUE} as date, t.project_id, pr.name as project_name,
  t.manager_id, m.name as manager_name`;
const TASK_JOINS = sql`left join core.projects pr on pr.id = t.project_id left join core.staff m on m.id = t.manager_id`;

/** Everything `buildDaySummary` / `buildWeekSummary` need for `[from, to]`. */
export async function loadSummaryData(
  user: AuthenticatedUser,
  input: { from: string; to: string; today: string },
): Promise<SummaryData> {
  const me = user.member.id;
  const isAdmin = canSeeAdminData(user);
  const open = openTask(isAdmin);

  const meetings = (
    await eventItemsInRange(
      user,
      { from: input.from, to: addDays(input.to, MEETING_LOOKAHEAD_DAYS) },
      { mostrar: "todo", quien: "yo", proyectos: [], etapa: null, responsable: null },
      { canViewTeam: false },
    )
  ).items;
  const meetingProjects = [...new Set(meetings.map((m) => m.project?.id).filter((id): id is string => !!id))];

  const mine = await db.execute<TaskRow>(sql`
    select ${TASK_COLUMNS} from core.tasks t ${TASK_JOINS}
    where ${open} and t.manager_id = ${me}::uuid and coalesce(t.commitment_date, t.delivery_date) <= ${input.to}::date
    order by coalesce(t.commitment_date, t.delivery_date), t.title limit ${TASK_CAP}
  `);

  const blocked = await db.execute<TaskRow>(sql`
    select ${TASK_COLUMNS} from core.tasks t ${TASK_JOINS}
    where ${open} and t.status = 'bloqueado'
      and (t.manager_id = ${me}::uuid
           or exists (select 1 from core.task_support ts where ts.task_id = t.id and ts.staff_id = ${me}::uuid)
           or exists (select 1 from core.project_members pm where pm.project_id = t.project_id and pm.staff_id = ${me}::uuid))
      and exists (
        select 1 from core.task_dependencies td join core.tasks d on d.id = td.task_id
        where td.depends_on_task_id = t.id and d.deleted_at is null and d.archived = false and d.closed_at is null and d.status <> 'completado')
    order by coalesce(t.commitment_date, t.delivery_date), t.title limit ${TASK_CAP}
  `);

  const overdue =
    meetingProjects.length === 0
      ? []
      : Array.from(
          await db.execute<TaskRow>(sql`
            select ${TASK_COLUMNS} from core.tasks t ${TASK_JOINS}
            where ${open} and t.project_id in (${uuidList(meetingProjects)})
              and coalesce(t.commitment_date, t.delivery_date) < ${input.today}::date
            order by coalesce(t.commitment_date, t.delivery_date), t.title limit ${TASK_CAP}
          `),
        );

  const rows = new Map<string, TaskRow>();
  for (const row of [...Array.from(mine), ...Array.from(blocked), ...overdue]) if (!rows.has(row.id)) rows.set(row.id, row);
  const ids = [...rows.keys()];

  const dependents = new Map<string, SummaryDependent[]>();
  const blockedSince = new Map<string, string>();
  if (ids.length > 0) {
    const list = uuidList(ids);
    const kindVisible = isAdmin ? sql`true` : sql`d.kind <> 'admin'`;
    const openD = sql`d.deleted_at is null and d.archived = false and d.closed_at is null and d.status <> 'completado' and ${kindVisible}`;
    const dep = await db.execute<DependentRow>(sql`
      select td.depends_on_task_id as parent_id, d.id, d.title, ${sql.raw("to_char(coalesce(d.commitment_date, d.delivery_date), 'YYYY-MM-DD')")} as date,
             d.manager_id, dm.name as manager_name, 'dependency' as via
      from core.task_dependencies td
      join core.tasks d on d.id = td.task_id
      left join core.staff dm on dm.id = d.manager_id
      where td.depends_on_task_id in (${list}) and ${openD}
      union all
      select d.parent_task_id as parent_id, d.id, d.title, ${sql.raw("to_char(coalesce(d.commitment_date, d.delivery_date), 'YYYY-MM-DD')")} as date,
             d.manager_id, dm.name as manager_name, 'subtask' as via
      from core.tasks d
      join core.tasks pt on pt.id = d.parent_task_id
      left join core.staff dm on dm.id = d.manager_id
      where d.parent_task_id in (${list}) and ${openD}
        and (coalesce(pt.commitment_date, pt.delivery_date) is null
             or coalesce(d.commitment_date, d.delivery_date) > coalesce(pt.commitment_date, pt.delivery_date))
    `);
    for (const d of Array.from(dep)) {
      const bucket = dependents.get(d.parent_id) ?? [];
      bucket.push({ taskId: d.id, title: d.title, date: d.date, managerId: d.manager_id, managerName: d.manager_name, via: d.via });
      dependents.set(d.parent_id, bucket);
    }
    const since = await db.execute<{ id: string; since: string }>(sql`
      select entity_id as id, to_char(max(event_at at time zone ${TZ}), 'YYYY-MM-DD') as since
      from core.history_events
      where entity = 'task' and kind = 'cambio' and field = 'status' and after_value = 'bloqueado' and entity_id in (${list})
      group by entity_id
    `);
    for (const s of Array.from(since)) blockedSince.set(s.id, s.since);
  }

  const tasks: SummaryTask[] = [...rows.values()].map((r) => ({
    taskId: r.id,
    title: r.title,
    date: r.date,
    project: r.project_id ? { id: r.project_id, name: r.project_name ?? "" } : null,
    manager: r.manager_id ? { id: r.manager_id, name: r.manager_name ?? "" } : null,
    status: r.status,
    blockedSince: r.status === "bloqueado" ? (blockedSince.get(r.id) ?? null) : null,
    dependents: dependents.get(r.id) ?? [],
  }));

  const oldestOverdue = new Map<string, { title: string; date: string }>();
  for (const r of overdue) if (r.project_id && !oldestOverdue.has(r.project_id)) oldestOverdue.set(r.project_id, { title: r.title, date: r.date });

  return { tasks, meetings, oldestOverdue };
}
