/**
 * A stand-in for Mi espacio's task reads in component tests (#1051):
 * `getMyTasksSummary` and `getMyTasksPage` answered from a fixture list with
 * the repository's rules (commitment date only, open = not completado and
 * no closing custom status), plus helpers that seed the cache the way the
 * page does. The real SQL is covered by `tests/db/my-tasks-summary.db.test.ts`.
 */
import type { QueryClient } from "@tanstack/react-query";

import { MY_TASK_BUCKETS, sundayOf } from "@/lib/my-space/my-tasks";
import {
  EMPTY_MY_TASKS_COUNTS,
  ME_TASKS_PAGE_SIZE,
  meTasksBucketFilters,
  meTasksCommitmentWindow,
  meTasksFirstPageSize,
  meTasksGroupFilters,
  meTasksProjectFilters,
  type MeTasksListFilters,
  type MyTasksCounts,
  type MyTasksSummary,
  type MyTasksSummaryInput,
} from "@/lib/my-space/my-tasks-summary";
import { meTaskRowOf, meTasksListOptions, meTasksSummaryOptions } from "@/lib/query/options/mi-espacio";
import type { TareasRowsPage } from "@/lib/tareas/page-data";
import { SIN_ETAPA_KEY, SIN_ETAPA_LABEL, SIN_ETAPA_SORT } from "@/lib/tareas/summary";
import type { TaskListItem } from "@/lib/types/core";

const SIN = { id: null, key: null, name: SIN_ETAPA_LABEL, sortOrder: SIN_ETAPA_SORT };

const due = (t: TaskListItem) => (t.commitmentDate ? t.commitmentDate.slice(0, 10) : null);
const isOpen = (t: TaskListItem) => t.status !== "completado" && !t.customStatus?.closes;

function inWindow(t: TaskListItem, w: { from?: string; to?: string; orUndated?: boolean } | undefined): boolean {
  if (!w) return true;
  const d = due(t);
  if (d === null) return Boolean(w.orUndated);
  if (w.from && d < w.from) return false;
  if (w.to && d > w.to) return false;
  return Boolean(w.from || w.to);
}

/** The server's folded search: no accents, no case. */
const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function matchesText(t: TaskListItem, q: string | null | undefined): boolean {
  return !q || fold(t.title).includes(fold(q));
}

function matchesEtapa(t: TaskListItem, etapa: string | null | undefined): boolean {
  if (!etapa) return true;
  if (etapa === SIN_ETAPA_KEY) return t.workflow === null;
  return t.workflow?.key === etapa;
}

export type FakeMyTasks = {
  tasks: TaskListItem[];
  today: string;
  summary(input: MyTasksSummaryInput): MyTasksSummary;
  page(input: { filters: MeTasksListFilters; cursor: string | null }): TareasRowsPage;
  /** Seeds the summary of `input` and the first page of each list, as the page does. */
  seed(client: QueryClient, input: MyTasksSummaryInput, lists: MeTasksListFilters[]): void;
  /** Every open Analítico etapa group of `input`. */
  analiticoLists(input: MyTasksSummaryInput, withClosed?: boolean): MeTasksListFilters[];
  boardLists(): MeTasksListFilters[];
  esencialLists(count?: number): MeTasksListFilters[];
};

export function fakeMyTasks(initial: TaskListItem[], today: string): FakeMyTasks {
  const fake: FakeMyTasks = {
    tasks: [...initial],
    today,
    summary(input) {
      const sunday = sundayOf(today);
      const live = fake.tasks.filter((t) => !t.archived);
      const open = live.filter(isOpen);
      const late = (t: TaskListItem) => isOpen(t) && due(t) !== null && due(t)! < today;
      const window = meTasksCommitmentWindow(input.retraso ? { retraso: true } : {}, today);
      const matches = (t: TaskListItem) => matchesEtapa(t, input.etapa) && matchesText(t, input.q) && inWindow(t, window);
      const countOf = (rows: TaskListItem[]): MyTasksCounts => {
        const m = rows.filter(matches);
        const overdue = m.filter(late);
        const days = overdue.map((t) => Math.round((Date.parse(today) - Date.parse(due(t)!)) / 86_400_000));
        return {
          open: m.filter(isOpen).length,
          overdue: overdue.length,
          blocked: m.filter((t) => isOpen(t) && t.status === "bloqueado").length,
          daysLateSum: days.reduce((a, b) => a + b, 0),
          maxDaysLate: days.reduce((a, b) => Math.max(a, b), 0),
          closed: m.filter((t) => !isOpen(t)).length,
        };
      };
      const projectIds = [...new Set(live.map((t) => t.projectId))];
      const projects = projectIds
        .map((id) => {
          const rows = live.filter((t) => t.projectId === id);
          const etapaIds = [...new Set(rows.map((t) => t.workflow?.id ?? null))];
          const etapas = etapaIds
            .map((wid) => {
              const inEtapa = rows.filter((t) => (t.workflow?.id ?? null) === wid);
              const w = inEtapa[0]!.workflow;
              return { etapa: w ? { id: w.id, key: w.key, name: w.name, sortOrder: w.sortOrder } : SIN, ...countOf(inEtapa) };
            })
            .filter((t) => t.open + t.closed > 0)
            .sort((a, b) => a.etapa.sortOrder - b.etapa.sortOrder || a.etapa.name.localeCompare(b.etapa.name, "es"));
          return { project: { id, name: rows[0]!.project.name }, ...countOf(rows), etapas };
        })
        .filter((p) => p.open + p.closed > 0)
        .sort((a, b) => Number(b.overdue > 0) - Number(a.overdue > 0) || a.project.name.localeCompare(b.project.name, "es"));
      const etapaMap = new Map<string, MyTasksSummary["etapas"][number]>();
      for (const t of open) {
        if (!t.workflow) continue;
        const entry = etapaMap.get(t.workflow.id) ?? { ...t.workflow, open: 0 };
        entry.open += 1;
        etapaMap.set(t.workflow.id, entry);
      }
      const esencial = projectIds
        .map((id) => {
          const rows = open.filter((t) => t.projectId === id);
          const dates = rows.map(due).filter((d): d is string => d !== null).sort();
          return {
            project: { id, name: live.find((t) => t.projectId === id)!.project.name },
            open: rows.length,
            overdue: rows.filter(late).length,
            nearestDue: dates[0] ?? null,
          };
        })
        .filter((p) => p.open > 0)
        .sort((a, b) => {
          const l = Number(b.overdue > 0) - Number(a.overdue > 0);
          if (l !== 0) return l;
          if (a.nearestDue !== b.nearestDue) {
            if (a.nearestDue === null) return 1;
            if (b.nearestDue === null) return -1;
            return a.nearestDue < b.nearestDue ? -1 : 1;
          }
          return a.project.name.localeCompare(b.project.name, "es");
        });
      const dueToday = open.filter((t) => due(t) === today).length;
      const overdueAll = open.filter(late).length;
      const shown = countOf(live);
      return {
        today,
        all: {
          open: open.length,
          overdue: overdueAll,
          dueToday,
          buckets: {
            hoy: overdueAll + dueToday,
            semana: open.filter((t) => due(t) !== null && due(t)! > today && due(t)! <= sunday).length,
            despues: open.filter((t) => due(t) === null || due(t)! > sunday).length,
          },
          projects: esencial.length,
        },
        etapas: [...etapaMap.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es")),
        shown: { ...EMPTY_MY_TASKS_COUNTS, ...shown, projects: projects.filter((p) => p.open > 0).length },
        projects,
        esencial,
      };
    },
    page({ filters: f, cursor }) {
      const window = meTasksCommitmentWindow(f, today);
      const rows = fake.tasks
        .filter((t) => !t.archived && (f.cerradas || isOpen(t)))
        .filter((t) => (!f.proyecto || t.projectId === f.proyecto) && matchesEtapa(t, f.etapa) && matchesText(t, f.q))
        .filter((t) => inWindow(t, window));
      const key = (t: TaskListItem) => {
        const d = due(t) ?? t.deliveryDate ?? "9999-12-31";
        const rank = !isOpen(t) ? 2 : due(t) !== null && due(t)! < today ? 0 : 1;
        return f.orderBy === "vence" ? `${d}|${t.id}` : `${rank}|${d}|${t.id}`;
      };
      rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      const offset = cursor ? Number(cursor.slice(1)) : 0;
      const limit = cursor ? ME_TASKS_PAGE_SIZE : meTasksFirstPageSize(f);
      const slice = rows.slice(offset, offset + limit);
      const next = offset + limit < rows.length ? `o${offset + limit}` : null;
      return { rows: slice.map(meTaskRowOf), nextCursor: next, total: rows.length };
    },
    seed(client, input, lists) {
      client.setQueryData(meTasksSummaryOptions(input).queryKey, fake.summary(input));
      for (const filters of lists) {
        client.setQueryData(meTasksListOptions(filters).queryKey, { pages: [fake.page({ filters, cursor: null })], pageParams: [null] });
      }
    },
    analiticoLists(input, withClosed = false) {
      return fake
        .summary(input)
        .projects.flatMap((p) => p.etapas.map((t) => meTasksGroupFilters(input, p.project.id, t.etapa.key, withClosed)));
    },
    boardLists() {
      return MY_TASK_BUCKETS.map(meTasksBucketFilters);
    },
    esencialLists(count = 3) {
      return fake
        .summary({ etapa: null, q: null })
        .esencial.slice(0, count)
        .map((p) => meTasksProjectFilters(p.project.id));
    },
  };
  return fake;
}
