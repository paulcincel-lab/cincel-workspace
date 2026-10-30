import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import type { TaskListItem } from "@/lib/types/core";

vi.mock("@/lib/proyectos/use-projects-data", () => ({
  useProjectsData: (projects: unknown[]) => ({
    projectsData: projects,
    isLoadingData: false,
  }),
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveDashboardCapabilities: () => ({ dataScope: "global" }),
  scopeDashboardProjects: ({ projects }: { projects: unknown[] }) => projects,
  scopeDashboardTasks: ({ tasks }: { tasks: unknown[] }) => tasks,
}));

const tasks: TaskListItem[] = [
  {
    id: "t1",
    projectId: "p1",
    kind: "usuario",
    templateId: null,
    workflowId: "w1",
    phase: null,
    title: "Render de fachada norte",
    notes: null,
    createdById: "u1",
    managerId: "u1",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: "2020-01-15",
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2020-01-01",
    updatedAt: "2020-01-01",
    customStatus: null,
    project: { id: "p1", name: "Residencia Valle Alto", clientName: "Cliente" },
    workflow: { id: "w1", key: "diseno", name: "Diseño" },
    areaColorSlot: 2,
    manager: { id: "u1", name: "Ana Ruiz" },
    support: [],
    checklist: { total: 0, completed: 0 },
  },
];

let currentTasks: TaskListItem[] = tasks;

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTasksAction: () => Promise.resolve(currentTasks),
}));

const fetchTrend = vi.fn();
vi.mock("@/lib/actions/dashboard-actions", () => ({
  fetchDashboardTaskTrendAction: (range: string) => fetchTrend(range),
}));

import { DashboardClient } from "./DashboardClient";

describe("DashboardClient widgets", () => {
  beforeEach(() => {
    currentTasks = tasks;
    fetchTrend.mockReset();
    fetchTrend.mockResolvedValue({
      labels: ["LUN", "MAR"],
      created: [0, 0],
      completed: [0, 0],
    });
  });

  it("renders the panels as shadcn cards with compact tables", async () => {
    const { container } = render(<DashboardClient initialProjects={[]} />);

    const row = (await screen.findByText("Render de fachada norte")).closest(
      "tr",
    );
    expect(row).not.toBeNull();
    const cells = within(row!);
    expect(cells.getByText("Residencia Valle Alto")).toBeTruthy();
    expect(cells.getByText("Diseño")).toBeTruthy();
    expect(cells.getByText("Ana Ruiz")).toBeTruthy();

    // The late date is monospaced and destructive.
    const dateCell = row!.querySelector("td:last-child");
    expect(dateCell?.className).toContain("font-mono");
    expect(dateCell?.className).toContain("text-destructive");

    expect(
      screen.getByRole("link", { name: "Ver todas →" }).getAttribute("href"),
    ).toBe("/actividades/general");

    expect(cells.getByText("Vencida")).toBeTruthy();

    // 4 KPI cards + 2 tables + trend + 2 donuts.
    const cards = container.querySelectorAll('[data-slot="card"]');
    expect(cards.length).toBe(9);
    const kpi = screen.getByText("Vencidas").closest('[data-slot="card"]');
    expect(kpi?.textContent).toContain("1");
    expect(kpi?.querySelector(".text-destructive")).not.toBeNull();
    expect(container.querySelectorAll('[data-slot="table"]').length).toBe(1);
    expect(
      screen.getByText("Sin revisiones en los próximos 7 días."),
    ).toBeTruthy();
  });

  it("lists an overdue and blocked task once with both reasons", async () => {
    currentTasks = [{ ...tasks[0], status: "bloqueado", manager: null }];
    render(<DashboardClient initialProjects={[]} />);

    const titles = await screen.findAllByText("Render de fachada norte");
    expect(titles.length).toBe(1);
    const cells = within(titles[0].closest("tr")!);
    expect(cells.getByText("Vencida")).toBeTruthy();
    expect(cells.getByText("Bloqueada")).toBeTruthy();
    expect(
      cells
        .getAllByText("Sin responsable")
        .some((el) => el.dataset.slot === "badge"),
    ).toBe(true);
  });

  it("lists upcoming reviews sorted by date", async () => {
    currentTasks = [
      {
        ...tasks[0],
        id: "r2",
        title: "Revisión tardía",
        commitmentDate: null,
        reviewDate: isoInDays(5),
      },
      {
        ...tasks[0],
        id: "r1",
        title: "Revisión próxima",
        commitmentDate: null,
        reviewDate: isoInDays(1),
      },
    ];
    render(<DashboardClient initialProjects={[]} />);

    const card = (await screen.findByText("Revisiones próximas")).closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(within(card).getAllByRole("row").length).toBe(3),
    );
    const rows = within(card).getAllByRole("row");
    expect(rows[1].textContent).toContain("Revisión próxima");
    expect(rows[2].textContent).toContain("Revisión tardía");
    expect(within(card).queryByText("Motivo")).toBeNull();
  });

  it("shows the status donut legend and the projects empty state", async () => {
    render(<DashboardClient initialProjects={[]} />);

    const statusCard = (await screen.findByText("Tareas por estatus")).closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    const legend = within(statusCard).getByText("Pendiente").closest("li");
    expect(legend?.textContent).toContain("100%");
    expect(screen.getByText("Sin proyectos activos.")).toBeTruthy();
  });

  it("loads the weekly task trend and shows the empty state when the range has no data", async () => {
    render(<DashboardClient initialProjects={[]} />);

    expect(
      await screen.findByText(
        "Sin tareas creadas ni completadas en este periodo.",
      ),
    ).toBeTruthy();
    expect(fetchTrend).toHaveBeenCalledWith("semana");
    expect(screen.queryByText("Avance semanal")).toBeNull();
    const trendCard = screen
      .getByText("Avance de tareas")
      .closest('[data-slot="card"]') as HTMLElement;
    expect(
      within(trendCard).getByRole("combobox", { name: "Periodo" }),
    ).toBeTruthy();
  });

  it("draws the trend chart when the range has data", async () => {
    fetchTrend.mockResolvedValue({
      labels: ["LUN", "MAR"],
      created: [2, 1],
      completed: [1, 3],
    });
    const { container } = render(<DashboardClient initialProjects={[]} />);

    const trendCard = (await screen.findByText("Avance de tareas")).closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(trendCard.querySelector('[data-slot="chart"]')).not.toBeNull(),
    );
    expect(
      within(trendCard).queryByText(
        "Sin tareas creadas ni completadas en este periodo.",
      ),
    ).toBeNull();
    expect(container.querySelectorAll('[data-slot="card"]').length).toBe(9);
  });
});

describe("app/dashboard colors", () => {
  const dir = resolve(__dirname);
  const sources = readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    .map((f) => [f, readFileSync(join(dir, f), "utf8")] as const);

  it.each(sources)(
    "%s has no hard-coded hex colors or palette classes",
    (_name, src) => {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(
        /\b(?:bg|text|border|ring|fill|stroke)-(?:red|green|blue|amber|yellow|orange|gray|neutral|zinc|slate|stone|white|black)\b/,
      );
    },
  );
});
