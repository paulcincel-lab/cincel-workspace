// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  getInicioPageData: vi.fn(),
  fetchMyProfileAction: vi.fn(),
  fetchCatalogProjectOptions: vi.fn(),
  fetchCatalogAssignableStaff: vi.fn(),
  fetchWorkflowsAction: vi.fn(),
  createUserTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/inicio-actions", () => ({ getInicioPageData: actions.getInicioPageData }));
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: actions.fetchMyProfileAction }));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: actions.fetchCatalogProjectOptions,
  fetchCatalogAssignableStaff: actions.fetchCatalogAssignableStaff,
}));
vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchWorkflowsAction: actions.fetchWorkflowsAction,
  fetchEtapasNavAction: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  createUserTaskAction: actions.createUserTaskAction,
  createSubtaskAction: actions.createSubtaskAction,
  setTaskStatusAction: actions.setTaskStatusAction,
  setTaskCustomStatusAction: actions.setTaskCustomStatusAction,
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(async () => ({ preferences: {}, appearance: {} })),
}));
vi.mock("@/components/shell/photo-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shell/photo-upload")>()),
  usePhotoUploadMutation: () => ({ mutateAsync: async () => "" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** The quick-add row as a button that submits a fixed draft, so these tests do not depend on the parser. */
const quickAdd = vi.hoisted(() => ({
  draft: {
    title: "Cotizar herrería",
    projectId: "p-1" as string | null,
    etapaId: "wf-diseno" as string | null,
    assigneeId: null as string | null,
    dueDate: "2026-11-12" as string | null,
    priority: "media" as const,
  },
}));
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context, onCreate }: { context: { label: string }; onCreate(d: unknown): Promise<unknown> }) => (
    <button type="button" onClick={() => void onCreate(quickAdd.draft).catch(() => undefined)}>
      {context.label}
    </button>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { InicioPageData } from "@/lib/loaders/inicio";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import type { InicioData } from "@/lib/types/redesign";
import type { AttentionItem } from "@/lib/types/widgets";

import { InicioClient } from "./InicioClient";
import {
  attentionMeta,
  esencialDateLine,
  insertMyWeekItem,
  pacePill,
  paceSentence,
  paceSummary,
  projectsByProgress,
} from "./InicioEsencial";
import { INICIO_EMPTY, INICIO_NON_ADMIN } from "./inicio-fixtures";

// 09:00 on Monday 9 November 2026 in Mexico City.
const NOW = "2026-11-09T15:00:00Z";
const PROFILE = { id: "s-1", name: "Ana López", photoUrl: null };

const attention = (over: Partial<AttentionItem> & { id: string }): AttentionItem => ({
  title: over.id,
  href: `/tareas?tarea=${over.id}`,
  project: "Oficina Polanco",
  etapa: "diseno",
  reason: "Vencida",
  tone: "critical",
  assignee: null,
  due: "2026-10-28",
  daysLate: 12,
  ...over,
});

const DATA: InicioData = {
  ...INICIO_NON_ADMIN,
  myAttention: 3,
  paceScope: "mine",
  myWeek: {
    today: [{ id: "c-t-1", title: "Revisar planos", start: "2026-11-09T11:00", project: "Casa Lomas", etapa: "diseno", href: "/tareas?tarea=t-1" }],
    week: [
      { id: "c-t-2", title: "Entregar renders", start: "2026-11-11T09:00", project: "Casa Lomas", etapa: "diseno", href: "/tareas?tarea=t-2" },
      { id: "c-t-3", title: "Cotizar acabados", start: "2026-11-13T09:00", project: "Depto Roma", etapa: "construccion", href: "/tareas?tarea=t-3" },
    ],
    total: 3,
  },
  attention: [
    attention({ id: "a-1", title: "Planos de fachada" }),
    attention({ id: "a-2", title: "Permiso de obra", reason: "Bloqueada", tone: "warn", daysLate: null, due: null }),
    attention({ id: "a-3", title: "Memoria de cálculo", daysLate: 3 }),
    attention({ id: "a-4", title: "Cuarta", daysLate: 1 }),
  ],
  projectsProgress: [
    { id: "p-1", label: "Casa Lomas", sublabel: "Diseño", real: 48, href: "/proyectos/p-1", atRisk: true },
    { id: "p-2", label: "Depto Roma", sublabel: "Construcción", real: 82, href: "/proyectos/p-2" },
    { id: "p-3", label: "Oficina Polanco", sublabel: "Presale", real: 12, href: "/proyectos/p-3" },
  ],
};

function renderEsencial(data: InicioData = DATA) {
  const client = createTestQueryClient();
  client.setQueryData<InicioPageData>(qk.inicio(), { inicio: data, firstLogin: { showGoogleSetupBanner: false } });
  client.setQueryData(qk.me.profile(), PROFILE);
  return renderWithQueryClient(
    <StyleProvider style="esencial" scope="staff">
      <InicioClient me={{ firstName: "Ana", name: "Ana López", role: "Arquitecta" }} now={NOW} />
    </StyleProvider>,
    { client },
  );
}

const card = (title: string) => screen.getByRole("region", { name: title });

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  // A refetch never settles, so the optimistic rows stay visible.
  actions.getInicioPageData.mockImplementation(() => new Promise(() => {}));
  actions.fetchCatalogProjectOptions.mockResolvedValue([]);
  useNewTaskUi.setState({ open: false, defaults: undefined, source: null });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("InicioEsencial header", () => {
  it("header count pluralizes", () => {
    const now = new Date(NOW);
    expect(esencialDateLine(now, 3)).toBe("Lunes 9 de noviembre · 3 cosas necesitan tu atención hoy.");
    expect(esencialDateLine(now, 1)).toBe("Lunes 9 de noviembre · 1 cosa necesita tu atención hoy.");
    expect(esencialDateLine(now, 0)).toBe("Lunes 9 de noviembre · nada necesita tu atención hoy.");

    renderEsencial();
    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana" })).toBeTruthy();
    expect(screen.getByText("Lunes 9 de noviembre · 3 cosas necesitan tu atención hoy.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nueva tarea" }).getAttribute("href")).toBe("/tareas?nueva=1");
  });
});

describe("InicioEsencial cards", () => {
  it("renders the four cards with no table", () => {
    renderEsencial();
    for (const title of ["Lo que vence esta semana", "Requiere atención", "Ritmo semanal", "Avance de proyectos"]) {
      expect(card(title)).toBeTruthy();
    }
    expect(document.querySelector("table")).toBeNull();
  });

  it("lists Hoy before Esta semana with the time and the day", () => {
    renderEsencial();
    const week = within(card("Lo que vence esta semana"));
    expect(week.getByText("3 tareas")).toBeTruthy();
    const groups = week.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["Hoy", "Esta semana"]);
    expect(within(week.getByRole("group", { name: "Hoy" })).getByText("11:00")).toBeTruthy();
    expect(within(week.getByRole("group", { name: "Esta semana" })).getByText("mié 11")).toBeTruthy();
  });

  it("shows the week empty state and keeps the quick-add", () => {
    renderEsencial({ ...INICIO_EMPTY });
    expect(screen.getByText("Nada vence esta semana")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agregar tarea" })).toBeTruthy();
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByText("Sin movimiento en las últimas semanas")).toBeTruthy();
    expect(screen.getByText("No hay proyectos activos")).toBeTruthy();
  });

  it("attention meta for blocked and etapa", () => {
    expect(attentionMeta(attention({ id: "x" })).map((m) => [m.label, m.dot ?? null, m.tone ?? null])).toEqual([
      ["Diseño", "var(--chart-2)", null],
      ["Oficina Polanco", null, "muted"],
      ["12 días tarde", null, "destructive"],
    ]);
    const blocked = attentionMeta(attention({ id: "y", reason: "Bloqueada", daysLate: null }));
    expect(blocked.map((m) => m.label)).toEqual(["Bloqueado", "Oficina Polanco"]);
    expect(blocked[0]!.dot).toBe("var(--destructive)");
    expect(attentionMeta(attention({ id: "z", daysLate: 1 })).at(-1)!.label).toBe("1 día tarde");

    renderEsencial();
    const box = within(card("Requiere atención"));
    // 3 of the 4 overdue-or-blocked items; the pill and the link count the overdue ones.
    expect(box.getByText("3 vencidas")).toBeTruthy();
    expect(box.getByText("Planos de fachada")).toBeTruthy();
    expect(box.queryByText("Cuarta")).toBeNull();
    expect(box.getByRole("link", { name: "Ver las 3 →" }).getAttribute("href")).toBe("/tareas?mostrar=en_retraso");
  });

  it("Ritmo pill signs and tones", () => {
    expect(pacePill(2)).toEqual({ label: "+2 esta semana", tone: "success" });
    expect(pacePill(0)).toEqual({ label: "0 esta semana", tone: "success" });
    expect(pacePill(-3)).toEqual({ label: "−3 esta semana", tone: "warning" });

    expect(paceSummary([{ weekStart: "2026-11-02", created: 9, completed: 11 }])).toEqual({ completed: 11, created: 9, net: 2 });
    expect(paceSummary([{ weekStart: "2026-11-02", created: 0, completed: 0 }])).toBeNull();
    expect(paceSummary([])).toBeNull();

    expect(paceSentence({ completed: 11, created: 9 }, "mine")).toBe("Cerraste 11 tareas y entraron 9.");
    expect(paceSentence({ completed: 11, created: 9 }, "team")).toBe("Se cerraron 11 tareas y entraron 9.");
    expect(paceSentence({ completed: 1, created: 1 }, undefined)).toBe("Se cerró 1 tarea y entró 1.");

    renderEsencial();
    const pace = within(card("Ritmo semanal"));
    // Last fixture week: created 19, completed 17.
    expect(pace.getByText("−2 esta semana")).toBeTruthy();
    expect(pace.getByText("Cerraste 17 tareas y entraron 19.")).toBeTruthy();
    expect(card("Ritmo semanal").querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });

  it("projects sorted by progress", () => {
    expect(projectsByProgress(DATA.projectsProgress).map((p) => p.id)).toEqual(["p-2", "p-1", "p-3"]);
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, real: i * 10 }));
    expect(projectsByProgress(many)).toHaveLength(6);

    renderEsencial();
    const box = within(card("Avance de proyectos"));
    expect(box.getAllByRole("progressbar").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Depto Roma: 82 %",
      "Casa Lomas: 48 %",
      "Oficina Polanco: 12 %",
    ]);
    expect(box.getByText("En riesgo · Diseño")).toBeTruthy();
    expect(box.getByRole("link", { name: "Ver todos →" }).getAttribute("href")).toBe("/proyectos");
  });

  it("shows 6 rows of Esta semana, then Ver N más", () => {
    const week = Array.from({ length: 8 }, (_, i) => ({
      id: `w-${i}`,
      title: `Semana ${i}`,
      start: `2026-11-1${Math.min(i, 5)}T09:0${i}`,
      href: `/tareas?tarea=w-${i}`,
    }));
    renderEsencial({ ...DATA, myWeek: { today: [], week, total: 8 } });
    const box = within(card("Lo que vence esta semana"));
    expect(box.queryByText("Semana 7")).toBeNull();
    fireEvent.click(box.getByRole("button", { name: "Ver 2 más" }));
    expect(box.getByText("Semana 7")).toBeTruthy();
  });
});

describe("InicioEsencial quick-add", () => {
  it("quick-add inserts into Esta semana", async () => {
    let resolve!: (v: unknown) => void;
    actions.createUserTaskAction.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { client } = renderEsencial();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Agregar tarea" }));
    });

    // Optimistic: the row is in Esta semana (Thursday 12) before the server answers.
    const week = within(screen.getByRole("group", { name: "Esta semana" }));
    expect(await week.findByText("Cotizar herrería")).toBeTruthy();
    expect(actions.createUserTaskAction).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p-1",
        title: "Cotizar herrería",
        workflowId: "wf-diseno",
        managerId: "s-1",
        commitmentDate: "2026-11-12",
      }),
    );

    // The mutation settles once its invalidations refetch: this refetch answers.
    actions.getInicioPageData.mockResolvedValue({ inicio: DATA, firstLogin: { showGoogleSetupBanner: false } });
    await act(async () => {
      resolve({ ok: true, data: { id: "t-new", title: "Cotizar herrería" } });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.inicio() }));
    expect(await screen.findByText("Tarea agregada")).toBeTruthy();
  });

  it("opens the new-task dialog prefilled when there is no project", async () => {
    quickAdd.draft.projectId = null;
    try {
      renderEsencial();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Agregar tarea" }));
      });
      expect(actions.createUserTaskAction).not.toHaveBeenCalled();
      expect(useNewTaskUi.getState().open).toBe(true);
      expect(useNewTaskUi.getState().defaults).toEqual({ title: "Cotizar herrería" });
    } finally {
      quickAdd.draft.projectId = "p-1";
    }
  });

  it("insertMyWeekItem puts the item in Hoy, Esta semana or nowhere", () => {
    const empty = { today: [], week: [], total: 0 };
    const item = (start: string) => ({ id: start, title: "Nueva", start });
    expect(insertMyWeekItem(empty, item("2026-11-09T09:00"), "2026-11-09").today).toHaveLength(1);
    const week = insertMyWeekItem(DATA.myWeek, item("2026-11-12T09:00"), "2026-11-09");
    expect(week.week.map((i) => i.id)).toEqual(["c-t-2", "2026-11-12T09:00", "c-t-3"]);
    expect(week.total).toBe(4);
    expect(insertMyWeekItem(empty, item("2026-11-16T09:00"), "2026-11-09")).toBe(empty);
  });
});
