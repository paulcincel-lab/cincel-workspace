// @vitest-environment happy-dom
/**
 * Personas · Equipo Visual (`PeopleLoadBoard`): the "Quién está saturado"
 * banner and its one-click reassign (with undo), the permission gate, the
 * 4-week heatmap and the page around it.
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  assignTaskAction: vi.fn(),
  fetchPersonaDetailAction: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/lib/actions/tasks-actions", () => ({ assignTaskAction: m.assignTaskAction }));
vi.mock("@/lib/actions/people-actions", () => ({ fetchPersonaDetailAction: m.fetchPersonaDetailAction }));
vi.mock("@/lib/actions/page-data/personas-actions", () => ({
  getPersonasEquipoPageData: vi.fn(),
  getPersonasCountsAction: vi.fn(),
  getPersonasContactsPageData: vi.fn(),
}));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffDetailAction: vi.fn(), saveMemberAction: vi.fn() }));
vi.mock("@/components/equipo/MemberEditorDrawer", () => ({ MemberEditorDrawer: () => null }));
vi.mock("@/lib/tramos/compat", () => ({
  tramoLabel: (key: string) => ({ presale: "Presale", diseno: "Diseño", construccion: "Construcción" })[key] ?? key,
  tramoColorSlot: (key: string) => ({ presale: 1, diseno: 2, construccion: 3 })[key] ?? null,
  tramoColorVar: (key: string) =>
    ({ presale: "var(--chart-1)", diseno: "var(--chart-2)", construccion: "var(--chart-3)" })[key] ?? "var(--muted-foreground)",
  phaseLabel: () => null,
  canSeeAdminData: () => false,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { EquipoView } from "@/components/personas/EquipoView";
import { PERSONAS_COUNTS } from "@/components/personas/personas-contacts.fixtures";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { WeekLoad } from "@/lib/types/redesign";
import type { AttentionItem, PersonDatum } from "@/lib/types/widgets";
import { seedSessionUser } from "@/tests/helpers/session-user";

import { PeopleLoadBoard, saturationLine, taskToMove, weekLabel } from "../PeopleLoadBoard";

const TODAY = "2026-11-11"; // Wednesday
const MONDAYS = ["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
const ANA = "00000000-0000-4000-8000-000000000001";
const BRUNO = "00000000-0000-4000-8000-000000000002";
const CARLA = "00000000-0000-4000-8000-000000000003";

function weeks(pcts: number[], absent: number[] = [0, 0, 0, 0]): WeekLoad[] {
  return MONDAYS.map((weekStart, i) => ({ weekStart, open: 1, occupancyPct: pcts[i] ?? 0, absentDays: absent[i] ?? 0 }));
}

function person(id: string, name: string, patch: Partial<PersonDatum>): PersonDatum {
  return {
    id,
    name,
    initials: name.slice(0, 2).toUpperCase(),
    puesto: null,
    tramo: "diseno",
    open: 4,
    overdue: 0,
    occupancyPct: 40,
    href: `/personas/equipo/${id}`,
    weeks: weeks([40, 40, 40, 40]),
    absences: [],
    ...patch,
  };
}

const SATURATED: PersonDatum[] = [
  person(ANA, "Ana Ruiz", {
    open: 13,
    overdue: 2,
    occupancyPct: 130,
    weeks: weeks([130, 90, 50, 20]),
    projects: [
      { projectId: "p1", name: "Casa Lomas", tramo: "diseno", open: 8, overdue: 2, weeks: [8, 0, 0, 0] },
      { projectId: "p2", name: "Oficina Roma", tramo: "diseno", open: 5, overdue: 0, weeks: [5, 0, 0, 0] },
    ],
  }),
  person(BRUNO, "Bruno Soto", { occupancyPct: 40 }),
  person(CARLA, "Carla Méndez", { tramo: "construccion", occupancyPct: 90, weeks: weeks([90, 0, 60, 30], [0, 5, 2, 0]) }),
];

function task(id: string, due: string | null, tramo: string | null): AttentionItem {
  return {
    id,
    title: `Tarea ${id}`,
    href: `/tareas?tarea=${id}`,
    project: "Casa Lomas",
    tramo,
    reason: "",
    tone: "default",
    assignee: null,
    due,
    daysLate: null,
  };
}

const ANA_TASKS: AttentionItem[] = [
  task("t-overdue", "2026-11-02", "diseno"),
  task("t-soon", "2026-11-20", "diseno"),
  task("t-latest", "2026-11-27", "diseno"),
  task("t-other-tramo", "2026-12-01", "construccion"),
  task("t-undated", null, "diseno"),
];

function renderBoard(people: PersonDatum[], options: { canAssign?: boolean } = {}) {
  const client = createTestQueryClient();
  client.setQueryData(qk.personas.detail(ANA), { tasks: ANA_TASKS } as never);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderWithQueryClient(
    <StyleProvider style="visual" scope="staff">
      <PeopleLoadBoard people={people} canAssign={options.canAssign ?? true} today={TODAY} />
    </StyleProvider>,
    { client },
  );
  return { ...view, client, invalidate };
}

beforeEach(() => {
  m.assignTaskAction.mockReset().mockResolvedValue({ ok: true, data: { id: "t-latest" } });
  m.fetchPersonaDetailAction.mockReset().mockResolvedValue({ tasks: ANA_TASKS });
  m.toast.mockReset();
  m.toast.error.mockReset();
});

afterEach(cleanup);

describe("PeopleLoadBoard banner", () => {
  it("hides the banner when nobody is over 100 %", () => {
    renderBoard(SATURATED.map((p) => (p.id === ANA ? { ...p, occupancyPct: 100 } : p)));
    expect(screen.queryByRole("region", { name: "Quién está saturado" })).toBeNull();
    expect(screen.getByRole("region", { name: "Equipo" })).toBeTruthy();
  });

  it("names the saturated person, the overdue projects and who is near the limit", () => {
    renderBoard(SATURATED);
    const banner = within(screen.getByRole("region", { name: "Quién está saturado" }));
    expect(banner.getByRole("heading", { name: "Ana Ruiz va al 130 % esta semana" })).toBeTruthy();
    expect(banner.getByText("2 tareas vencidas en Diseño · Casa Lomas.")).toBeTruthy();
    expect(banner.getByText("Carla Méndez")).toBeTruthy();
  });

  it("moves the latest non-overdue task to the candidate", async () => {
    const { invalidate } = renderBoard(SATURATED);
    const button = await screen.findByRole("button", { name: "Mover 1 tarea a Bruno Soto (40 %)" });
    fireEvent.click(button);
    await waitFor(() => expect(m.assignTaskAction).toHaveBeenCalledWith("t-latest", BRUNO));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith("Tarea movida a Bruno Soto", expect.anything()));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.personas.equipo() }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.personas.detail(ANA) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.personas.detail(BRUNO) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.inicio() });
  });

  it("undo reassigns back", async () => {
    renderBoard(SATURATED);
    fireEvent.click(await screen.findByRole("button", { name: /^Mover 1 tarea a Bruno Soto/ }));
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    const options = m.toast.mock.calls[0]![1] as { action: { label: string; onClick(): void } };
    expect(options.action.label).toBe("Deshacer");
    options.action.onClick();
    await waitFor(() => expect(m.assignTaskAction).toHaveBeenLastCalledWith("t-latest", ANA));
  });

  it("shows the error copy in a toast when the move fails", async () => {
    m.assignTaskAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    renderBoard(SATURATED);
    fireEvent.click(await screen.findByRole("button", { name: /^Mover 1 tarea a Bruno Soto/ }));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
  });

  it("hides the button without canAssign", () => {
    renderBoard(SATURATED, { canAssign: false });
    expect(screen.getByRole("region", { name: "Quién está saturado" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Mover 1 tarea/ })).toBeNull();
    expect(m.fetchPersonaDetailAction).not.toHaveBeenCalled();
  });

  it("hides the button without a candidate in the same tramo", () => {
    renderBoard(SATURATED.filter((p) => p.id !== BRUNO));
    expect(screen.queryByRole("button", { name: /^Mover 1 tarea/ })).toBeNull();
  });
});

describe("PeopleLoadBoard heatmap", () => {
  it("renders Vac. for a full absence week and the pct with the absence days otherwise", () => {
    renderBoard(SATURATED);
    const table = screen.getByRole("table", { name: "Carga por persona y semana" });
    const carla = within(within(table).getByRole("rowheader", { name: "Carla Méndez" }).closest("tr")!);
    const cells = carla.getAllByRole("cell").map((td) => td.textContent);
    expect(cells).toEqual(["90 %", "Vac.", "60 %, 2 días de vacaciones", "30 %"]);
  });

  it("labels the weeks Monday to Sunday across months", () => {
    expect(weekLabel("2026-11-09")).toBe("9–15 nov");
    expect(weekLabel("2026-11-30")).toBe("30 nov–6 dic");
  });
});

describe("PeopleLoadBoard helpers", () => {
  it("picks the latest open task that is not overdue in the candidate's tramo", () => {
    expect(taskToMove(ANA_TASKS, "diseno", TODAY)?.id).toBe("t-latest");
    expect(taskToMove(ANA_TASKS, "presale", TODAY)).toBeNull();
    expect(taskToMove(ANA_TASKS, null, TODAY)).toBeNull();
  });

  it("writes the banner line with singular forms and the capacity without overdue tasks", () => {
    expect(saturationLine(person(ANA, "Ana", { overdue: 1, projects: [] }))).toBe("1 tarea vencida en Diseño.");
    expect(saturationLine(person(ANA, "Ana", { overdue: 0, open: 11, occupancyPct: 110 }))).toBe(
      "11 tareas abiertas para una capacidad de 10.",
    );
    const many = ["A", "B", "C", "D", "E"].map((name, i) => ({
      projectId: `p${i}`,
      name,
      tramo: "diseno",
      open: 1,
      overdue: 1,
      weeks: [1, 0, 0, 0] as [number, number, number, number],
    }));
    expect(saturationLine(person(ANA, "Ana", { overdue: 5, projects: many }))).toBe(
      "5 tareas vencidas en Diseño · A, B, C y 2 más.",
    );
  });
});

describe("Personas Visual page", () => {
  it("shows Proveedores tab", () => {
    seedSessionUser({ member: { id: "s-admin", name: "Ana" }, access: "Administrador" });
    renderWithQueryClient(
      <StyleProvider style="visual" scope="staff">
        <EquipoView people={SATURATED} emails={{}} counts={PERSONAS_COUNTS} canCreate canAssign canCreateTask />
      </StyleProvider>,
    );
    const nav = within(screen.getByRole("navigation", { name: "Secciones de Personas" }));
    expect(nav.getByRole("link", { name: /Proveedores/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agregar persona" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Equipo" })).toBeTruthy();
  });
});
