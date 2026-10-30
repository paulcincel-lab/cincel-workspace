import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { TaskListItem } from "@/lib/types/core";

vi.mock("@/lib/proyectos/use-projects-data", () => ({
  useProjectsData: (projects: unknown[]) => ({ projectsData: projects, isLoadingData: false }),
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

vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTasksAction: () => Promise.resolve(tasks),
}));

import { DashboardClient } from "./DashboardClient";

describe("DashboardClient widgets", () => {
  it("renders the panels as shadcn cards with compact tables", async () => {
    const { container } = render(<DashboardClient initialProjects={[]} />);

    const row = (await screen.findByText("Render de fachada norte")).closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row!);
    expect(cells.getByText("Residencia Valle Alto")).toBeTruthy();
    expect(cells.getByText("Diseño")).toBeTruthy();
    expect(cells.getByText("Ana Ruiz")).toBeTruthy();

    // The late date is monospaced and destructive.
    const dateCell = row!.querySelector("td:last-child");
    expect(dateCell?.className).toContain("font-mono");
    expect(dateCell?.className).toContain("text-destructive");

    expect(screen.getByRole("link", { name: "Ver todas →" }).getAttribute("href")).toBe("/actividades/general");

    const cards = container.querySelectorAll('[data-slot="card"]');
    expect(cards.length).toBe(3);
    cards.forEach((card) => expect(card.querySelector('[data-slot="card-title"]')).not.toBeNull());
    expect(container.querySelectorAll('[data-slot="table"]').length).toBe(2);
  });
});

describe("app/dashboard colors", () => {
  const dir = resolve(__dirname);
  const sources = readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    .map((f) => [f, readFileSync(join(dir, f), "utf8")] as const);

  it.each(sources)("%s has no hard-coded hex colors or palette classes", (_name, src) => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(
      /\b(?:bg|text|border|ring|fill|stroke)-(?:red|green|blue|amber|yellow|orange|gray|neutral|zinc|slate|stone|white|black)\b/
    );
  });
});
