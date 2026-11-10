// @vitest-environment node
/**
 * Inicio Analítico data (#991) against a real Postgres: the
 * `retraso_promedio` KPI, the workload `inProgress` / `avgDaysLate` columns
 * and the `projectId` / `status` of attention items, from `loadInicio`.
 * Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row a test creates carries a per-run marker
 * and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveDashboardCapabilities: () => ({
      dataScope: "managed_projects",
      sections: { showProjectAssignments: true, showProjectRisk: true, showTeamWorkload: true },
    }),
  };
});

const run = randomUUID().slice(0, 8);
const TZ = "America/Mexico_City";

describe.skipIf(!url)("Inicio Analítico loader (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { localIsoDate } = await import("@/lib/dashboard/task-trend");
  const { shiftIsoDate } = await import("@/lib/dashboard/inicio");
  const { loadInicio } = await import("@/lib/loaders/inicio");
  type User = Parameters<typeof loadInicio>[0];

  const today = localIsoDate(new Date(), TZ);
  const ids = { staff: [] as string[], projects: [] as string[], tasks: [] as string[] };
  const t = {} as Record<"late3" | "late7" | "blocked" | "doing", string>;
  let colabId = "";
  let colabName = "";
  let projectId = "";
  let user: User;

  beforeAll(async () => {
    colabName = `Analitico ${run} colab`;
    const [colab] = await db
      .insert(schema.staff)
      .values({ name: colabName, email: `analitico-${run}@cincel.example`, role: "Colaborador", active: true, capacity: 4 })
      .returning({ id: schema.staff.id });
    colabId = colab.id;
    ids.staff.push(colab.id);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Analitico ${run} proyecto`, managerId: colabId, progress: 10, status: "activo" })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);

    const add = async (label: string, values: Partial<typeof schema.tasks.$inferInsert>) => {
      const [row] = await db
        .insert(schema.tasks)
        .values({ projectId, kind: "usuario", title: `Analitico ${run} ${label}`, createdById: colabId, managerId: colabId, ...values })
        .returning({ id: schema.tasks.id });
      ids.tasks.push(row.id);
      return row.id;
    };
    t.late3 = await add("vencida 3", { commitmentDate: shiftIsoDate(today, -3) });
    t.late7 = await add("vencida 7", { status: "en_proceso", commitmentDate: shiftIsoDate(today, -7) });
    t.blocked = await add("bloqueada", { status: "bloqueado", commitmentDate: shiftIsoDate(today, 10) });
    t.doing = await add("en proceso", { status: "en_proceso", commitmentDate: shiftIsoDate(today, 5) });

    user = {
      member: {
        id: colabId,
        name: colabName,
        role: "Colaborador",
        area: "",
        capacity: 4,
        availability: "",
        active: true,
        institutionalEmail: "",
        phone: "",
      },
      email: `analitico-${run}@cincel.example`,
      access: "Colaborador",
    } as unknown as User;
  });

  afterAll(async () => {
    // Cascades the tasks.
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, ids.staff));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    }
  });

  it("retraso_promedio series and delta", async () => {
    const { kpis } = await loadInicio(user);
    const kpi = kpis.find((k) => k.key === "retraso_promedio");
    // (3 + 7) / 2 days late today; the tasks did not exist a week ago.
    expect(kpi).toMatchObject({ value: 5, display: "5.0 d", visibleIn: ["analitico"] });
    expect(kpi?.series7).toHaveLength(7);
    expect(kpi?.series7?.[6]).toBe(5);
    expect(kpi?.series7?.[0]).toBe(0);
    expect(kpi?.delta).toMatchObject({ value: 5, good: false, tone: "bad" });
  });

  it("workload inProgress and avgDaysLate", async () => {
    const { workload } = await loadInicio(user);
    expect(workload.find((p) => p.id === colabId)).toMatchObject({
      open: 4,
      overdue: 2,
      inProgress: 2,
      avgDaysLate: 5,
      occupancyPct: 100,
    });
  });

  it("attention carries projectId and status", async () => {
    const { attention } = await loadInicio(user);
    expect(attention.find((a) => a.id === t.late3)).toMatchObject({
      projectId,
      status: { value: "pendiente", label: "Pendiente" },
      reason: "Vencida",
      daysLate: 3,
    });
    expect(attention.find((a) => a.id === t.blocked)).toMatchObject({
      projectId,
      status: { value: "bloqueado", label: "Bloqueado" },
      reason: "Bloqueada",
    });
  });
});
