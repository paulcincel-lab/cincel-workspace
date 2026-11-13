// @vitest-environment happy-dom
/**
 * Personas · Equipo Esencial (`PeopleEsencialTeam`): pill filter in the URL,
 * one expanded card at a time with its detail read once, quick assign for
 * the preset person, the Tab suggestion, permissions and Escape.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchPersonaDetailAction: vi.fn(),
  createUserTaskAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/actions/people-actions", () => ({ fetchPersonaDetailAction: m.fetchPersonaDetailAction }));
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: m.createUserTaskAction }));
vi.mock("@/lib/actions/page-data/personas-actions", () => ({
  getPersonasEquipoPageData: vi.fn(),
  getPersonasCountsAction: vi.fn(),
  getPersonasContactsPageData: vi.fn(),
}));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: vi.fn(async () => []) }));
vi.mock("@/lib/query/options/catalog", () => ({
  catalogWorkflowsOptions: () => ({
    queryKey: ["catalog", "workflows"],
    queryFn: async () => [
      { id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 1 },
      { id: "wf-construccion", key: "construccion", name: "Construcción", sortOrder: 2 },
    ],
  }),
}));
vi.mock("@/lib/settings/use-general-settings", () => ({
  useGeneralSettings: () => ({ regional: { timeZone: "America/Mexico_City" } }),
}));
vi.mock("@/lib/etapas/compat", () => ({
  etapaLabel: (key: string) => ({ diseno: "Diseño", construccion: "Construcción" })[key] ?? key,
  etapaColorSlot: (key: string) => ({ diseno: 2, construccion: 3 })[key] ?? null,
  etapaColorVar: () => "var(--chart-2)",
}));
// The quick add line itself is #984's; here it only hands a draft with a project to `onCreate`.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({
    context,
    onCreate,
  }: {
    context: { label: string; etapaId?: string | null; assigneeId?: string | null };
    onCreate(d: unknown): Promise<unknown>;
  }) => (
    <input
      aria-label={context.label}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        const input = event.currentTarget;
        void onCreate({
          title: input.value,
          projectId: "proj-1",
          etapaId: context.etapaId ?? null,
          assigneeId: context.assigneeId ?? null,
          dueDate: null,
          priority: "media",
        }).then(() => {
          input.value = "";
        });
      }}
    />
  ),
}));

import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { PersonDatum } from "@/lib/types/widgets";

import { PeopleEsencialTeam } from "../PeopleWidget";

const TODAY = "2026-11-09";
const ANA = "00000000-0000-4000-8000-000000000001";
const LUIS = "00000000-0000-4000-8000-000000000002";
const SOFIA = "00000000-0000-4000-8000-000000000003";

const PEOPLE: PersonDatum[] = [
  { id: ANA, name: "Ana Ruiz", initials: "AR", puesto: "Diseñadora", etapa: "diseno", open: 4, overdue: 1, occupancyPct: 100, href: `/personas/equipo/${ANA}` },
  { id: LUIS, name: "Luis Pérez", initials: "LP", puesto: null, etapa: "diseno", open: 1, overdue: 0, occupancyPct: 20, href: `/personas/equipo/${LUIS}` },
  { id: SOFIA, name: "Sofía León", initials: "SL", puesto: "Residente", etapa: "construccion", open: 9, overdue: 3, occupancyPct: 150, href: `/personas/equipo/${SOFIA}` },
];

function detailFor(staffId: string) {
  return {
    tasks: [
      {
        id: `${staffId}-t1`,
        title: `Planos de ${staffId.slice(-1)}`,
        href: `/tareas?tarea=${staffId}-t1`,
        project: "Casa Lomas",
        etapa: "diseno",
        reason: "",
        tone: "default",
        assignee: null,
        due: "2026-11-05",
        daysLate: 4,
      },
    ],
  };
}

function createdTask(title: string, managerId: string) {
  return {
    id: "t-new",
    title,
    managerId,
    commitmentDate: null,
    project: { id: "proj-1", name: "Casa Lomas", clientName: null },
    workflow: { id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 1 },
  };
}

function renderTeam(props: Partial<Parameters<typeof PeopleEsencialTeam>[0]> = {}) {
  return renderWithQueryClient(
    <PeopleEsencialTeam people={PEOPLE} canCreateTask canAssign today={TODAY} {...props} />,
  );
}

function card(name: string) {
  return screen.getByRole("article", { name });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/personas");
  m.fetchPersonaDetailAction.mockReset().mockImplementation(async ({ staffId }: { staffId: string }) => detailFor(staffId));
  m.createUserTaskAction
    .mockReset()
    .mockImplementation(async (input: { title: string; managerId: string }) => ({
      ok: true,
      data: createdTask(input.title, input.managerId),
    }));
});

afterEach(cleanup);

describe("PeopleEsencialTeam", () => {
  it("filters by pill and keeps ?estado", () => {
    renderTeam();
    const pills = screen.getByRole("group", { name: "Filtrar por carga" });
    expect(within(pills).getByRole("button", { name: /Todos/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(pills).getByRole("button", { name: /Saturados/ }));
    expect(new URLSearchParams(window.location.search).get("estado")).toBe("saturado");
    expect(screen.queryByRole("article", { name: "Ana Ruiz" })).toBeNull();
    expect(card("Sofía León")).toBeTruthy();
    expect(within(pills).getByRole("button", { name: /Saturados/ }).getAttribute("aria-pressed")).toBe("true");

    // A reload starts from the URL.
    cleanup();
    renderTeam();
    expect(screen.queryByRole("article", { name: "Luis Pérez" })).toBeNull();
    expect(card("Sofía León")).toBeTruthy();
  });

  it("expands one card at a time and loads its detail once", async () => {
    renderTeam();
    expect(m.fetchPersonaDetailAction).not.toHaveBeenCalled();
    const anaToggle = screen.getByRole("button", { name: "Tareas de Ana Ruiz" });
    const luisToggle = screen.getByRole("button", { name: "Tareas de Luis Pérez" });

    fireEvent.click(anaToggle);
    expect(anaToggle.getAttribute("aria-expanded")).toBe("true");
    expect(new URLSearchParams(window.location.search).get("persona")).toBe(ANA);
    expect(await within(card("Ana Ruiz")).findByText("Planos de 1")).toBeTruthy();

    fireEvent.click(luisToggle);
    expect(anaToggle.getAttribute("aria-expanded")).toBe("false");
    expect(luisToggle.getAttribute("aria-expanded")).toBe("true");
    await within(card("Luis Pérez")).findByText("Planos de 2");

    fireEvent.click(anaToggle);
    await within(card("Ana Ruiz")).findByText("Planos de 1");
    const anaCalls = m.fetchPersonaDetailAction.mock.calls.filter(([input]) => input.staffId === ANA);
    expect(anaCalls).toHaveLength(1);
  });

  it("creates a task for the preset person and shows Nueva", async () => {
    renderTeam();
    fireEvent.click(within(card("Luis Pérez")).getByRole("button", { name: "+ Asignar una tarea a Luis…" }));
    const input = await within(card("Luis Pérez")).findByRole("textbox", { name: "Asignar una tarea a Luis Pérez" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await within(card("Luis Pérez")).findByText("Planos de 2");

    fireEvent.change(input, { target: { value: "Revisar acabados" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(m.createUserTaskAction).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", title: "Revisar acabados", managerId: LUIS }),
      ),
    );
    expect(m.createUserTaskAction).toHaveBeenCalledTimes(1);
    expect(await within(card("Luis Pérez")).findByText("Revisar acabados")).toBeTruthy();
    expect(within(card("Luis Pérez")).getByText("Nueva")).toBeTruthy();
    expect(await within(card("Luis Pérez")).findByText("Tarea creada para Luis Pérez")).toBeTruthy();
  });

  it("Tab accepts the suggested assignee", async () => {
    renderTeam();
    fireEvent.click(screen.getByRole("button", { name: "Tareas de Ana Ruiz" }));
    const ana = card("Ana Ruiz");
    expect(await within(ana).findByText("Ana ya va al 100 %. Luis está al 20 % en Diseño.")).toBeTruthy();
    expect(within(ana).getByRole("button", { name: "Asignar a Luis · Tab" })).toBeTruthy();

    const input = within(ana).getByRole("textbox", { name: "Asignar una tarea a Ana Ruiz" });
    input.focus();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(await within(ana).findByText("Se asignará a Luis Pérez")).toBeTruthy();
    expect(within(ana).queryByRole("button", { name: "Asignar a Luis · Tab" })).toBeNull();

    const swapped = within(ana).getByRole("textbox", { name: "Asignar una tarea a Luis Pérez" });
    fireEvent.change(swapped, { target: { value: "Cotizar muebles" } });
    fireEvent.keyDown(swapped, { key: "Enter" });
    await waitFor(() =>
      expect(m.createUserTaskAction).toHaveBeenCalledWith(expect.objectContaining({ title: "Cotizar muebles", managerId: LUIS })),
    );
  });

  it("hides quick assign without canCreateTask", async () => {
    renderTeam({ canCreateTask: false });
    expect(screen.queryByRole("button", { name: /Asignar una tarea/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tareas de Ana Ruiz" }));
    await within(card("Ana Ruiz")).findByText("Planos de 1");
    expect(within(card("Ana Ruiz")).queryByRole("textbox")).toBeNull();
  });

  it("hides the suggestion button without canAssign", async () => {
    renderTeam({ canAssign: false });
    fireEvent.click(screen.getByRole("button", { name: "Tareas de Ana Ruiz" }));
    const ana = card("Ana Ruiz");
    await within(ana).findByText("Ana ya va al 100 %. Luis está al 20 % en Diseño.");
    expect(within(ana).queryByRole("button", { name: /Asignar a Luis/ })).toBeNull();
  });

  it("Escape collapses and restores focus", async () => {
    renderTeam();
    const toggle = screen.getByRole("button", { name: "Tareas de Ana Ruiz" });
    fireEvent.click(toggle);
    const ana = card("Ana Ruiz");
    const link = await within(ana).findByRole("link", { name: "Planos de 1" });
    link.focus();
    act(() => {
      fireEvent.keyDown(link, { key: "Escape" });
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(new URLSearchParams(window.location.search).get("persona")).toBeNull();
  });

  it("shows the no-match state and clears the filters", async () => {
    vi.useFakeTimers();
    try {
      renderTeam();
      fireEvent.change(screen.getByRole("searchbox", { name: "Buscar persona" }), { target: { value: "zzz" } });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText("Nadie coincide con este filtro.")).toBeTruthy();
      expect(new URLSearchParams(window.location.search).get("q")).toBe("zzz");
      fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
      expect(screen.getAllByRole("article")).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
