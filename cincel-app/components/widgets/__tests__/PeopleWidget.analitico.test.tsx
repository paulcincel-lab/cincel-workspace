// @vitest-environment happy-dom
/**
 * Personas · Analítico (#1000): the grouped table tramo → persona → proyecto,
 * expand state kept in the URL, quick assign with its impact line, footer
 * totals and the CSV export of the visible people.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => "/personas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/tramos/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

vi.mock("@/lib/quick-add/parse", () => ({
  parseQuickAdd: (text: string) => {
    const friday = / el viernes$/.test(text);
    return {
      title: text.replace(/ el viernes$/, "").trim(),
      ...(friday ? { dueDate: "2026-11-20" } : {}),
      tokens: [],
      slash: null,
    };
  },
}));

vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: (props: {
    context: { label: string; projectId: string | null; tramoId?: string | null; assigneeId?: string | null };
    onCreate(draft: Record<string, unknown>): Promise<unknown>;
  }) => (
    <tr>
      <td colSpan={10}>
        <input
          aria-label={props.context.label}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            void props.onCreate({
              title: (event.target as HTMLInputElement).value,
              projectId: props.context.projectId,
              tramoId: props.context.tramoId ?? null,
              assigneeId: null,
              dueDate: null,
              priority: "media",
            });
          }}
        />
      </td>
    </tr>
  ),
}));

vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: vi.fn() }));
vi.mock("@/components/tareas/NewTaskDialog", () => ({ newTaskInvalidations: () => [] }));
vi.mock("@/lib/query/options/catalog", () => ({
  catalogTramosOptions: () => ({ queryKey: ["catalog", "tramos"], queryFn: async () => TRAMOS }),
}));
vi.mock("@/components/personas/PersonasTabs", () => ({ PersonasTabs: () => null }));
vi.mock("@/components/widgets/PageHeader", () => ({
  PageHeader: (props: { title: string; actions?: ReactNode }) => (
    <header>
      <h1>{props.title}</h1>
      {props.actions}
    </header>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { EquipoAnalitico } from "@/components/personas/EquipoAnalitico";
import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import type { PeopleTeamAnaliticoProps } from "@/components/widgets/PeopleTeamAnalitico";
import { useTeamAnaliticoState } from "@/lib/personas/use-team-analitico-state";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { WeekLoad } from "@/lib/types/redesign";
import type { PersonDatum } from "@/lib/types/widgets";

const TODAY = "2026-11-09";
const MONDAYS = ["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
const TRAMOS = [
  { id: "w-pre", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w-dis", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w-con", key: "construccion", name: "Construcción", sortOrder: 3 },
];

function weeks(pcts: number[], open: number[], absentDays: number[] = [0, 0, 0, 0]): WeekLoad[] {
  return MONDAYS.map((weekStart, i) => ({ weekStart, occupancyPct: pcts[i]!, open: open[i]!, absentDays: absentDays[i]! }));
}

const PEOPLE: PersonDatum[] = [
  {
    id: "ana",
    name: "Ana Ruiz",
    initials: "AR",
    puesto: "Diseñadora",
    tramo: "diseno",
    open: 6,
    overdue: 4,
    occupancyPct: 112,
    capacity: 5,
    href: "/personas/equipo/ana",
    weeks: weeks([112, 104, 86, 60], [6, 5, 4, 3]),
    projects: [
      { projectId: "p1", name: "Oficina Polanco", tramo: "diseno", open: 2, overdue: 2, weeks: [2, 2, 0, 0] },
      { projectId: "p2", name: "Casa Valle de Bravo", tramo: "diseno", open: 1, overdue: 0, weeks: [0, 1, 1, 1] },
    ],
    sharesProjectWithViewer: true,
  },
  {
    id: "valeria",
    name: "Valeria Ortiz",
    initials: "VO",
    puesto: "Diseñadora",
    tramo: "diseno",
    open: 3,
    overdue: 0,
    occupancyPct: 70,
    capacity: 5,
    href: "/personas/equipo/valeria",
    weeks: weeks([70, 75, 50, 40], [3, 3, 2, 2]),
    projects: [{ projectId: "p3", name: "Depto Roma Norte", tramo: "diseno", open: 3, overdue: 0, weeks: [3, 0, 0, 0] }],
    sharesProjectWithViewer: false,
  },
  {
    id: "luis",
    name: "Luis Pérez",
    initials: "LP",
    puesto: "Presale",
    tramo: "presale",
    open: 4,
    overdue: 1,
    occupancyPct: 85,
    capacity: 5,
    href: "/personas/equipo/luis",
    weeks: weeks([85, 70, 55, 40], [4, 3, 2, 2]),
    projects: [{ projectId: "p4", name: "Casa Madrid 22", tramo: "presale", open: 4, overdue: 1, weeks: [4, 0, 0, 0] }],
    sharesProjectWithViewer: true,
  },
  {
    id: "sofia",
    name: "Sofía León",
    initials: "SL",
    puesto: "Decoración",
    tramo: "construccion",
    open: 2,
    overdue: 0,
    occupancyPct: 55,
    capacity: 5,
    href: "/personas/equipo/sofia",
    weeks: weeks([55, 0, 60, 40], [2, 0, 3, 2], [0, 5, 0, 0]),
    projects: [{ projectId: "p5", name: "Depto Condesa", tramo: "construccion", open: 2, overdue: 0, weeks: [2, 0, 0, 0] }],
    sharesProjectWithViewer: false,
  },
];

type TeamProps = Omit<PeopleTeamAnaliticoProps, "people" | "loading" | "state" | "onStateChange" | "tramos" | "today">;

function UrlTeam(props: Partial<TeamProps>) {
  const [state, setState] = useTeamAnaliticoState();
  return (
    <PeopleWidget
      people={PEOPLE}
      show={["load", "projects"]}
      team={{
        tramos: TRAMOS,
        today: TODAY,
        state,
        onStateChange: setState,
        canCreateTask: false,
        canAssign: false,
        ...props,
      }}
    />
  );
}

function renderTeam(props: Partial<TeamProps> = {}) {
  return render(
    <StyleProvider style="analitico" scope="staff">
      <UrlTeam {...props} />
    </StyleProvider>,
  );
}

function table() {
  return screen.getByRole("table", { name: "Personas por tramo" });
}

function text(el: Element | null) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  window.history.replaceState(null, "", "/personas");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PeopleWidget · Personas Analítico", () => {
  it("expands a person and shows project rows", () => {
    renderTeam();
    // Groups in tramo order, every group expanded, no person expanded.
    const groupButtons = within(table()).getAllByRole("button", { expanded: true }).filter((b) => b.getAttribute("aria-controls")?.startsWith("g-"));
    expect(groupButtons.map((b) => b.getAttribute("aria-controls"))).toEqual(["g-presale-rows", "g-diseno-rows", "g-construccion-rows"]);
    expect(screen.queryByText("Oficina Polanco")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Expandir Ana Ruiz" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    const collapse = screen.getByRole("button", { name: "Contraer Ana Ruiz" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    for (const id of collapse.getAttribute("aria-controls")!.split(" ")) expect(document.getElementById(id)).not.toBeNull();
    const row = screen.getByText("Oficina Polanco").closest("tr")!;
    const cells = within(row).getAllByRole("cell").map(text);
    expect(cells.slice(1, 9)).toEqual(["Diseño", "2", "2", "2 tareas", "2", "2", "—", "—"]);
    expect(screen.getByText("Casa Valle de Bravo")).toBeTruthy();
    // No hour figures anywhere.
    expect(text(table())).not.toMatch(/\d+ h\b/);

    // Group header: count, totals and average load.
    const diseno = screen.getAllByRole("button", { expanded: true }).find((b) => b.getAttribute("aria-controls") === "g-diseno-rows")!;
    expect(text(diseno)).toBe("Diseño 2 personas 9 abiertas · 4 vencidas · carga 91 %");
  });

  it("Expandir todo / Contraer todo", () => {
    renderTeam();
    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    const groups = () => within(table()).getAllByRole("button").filter((b) => b.getAttribute("aria-controls")?.startsWith("g-"));
    expect(groups().every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(screen.queryByRole("link", { name: "Ana Ruiz" })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("abiertos")).toBe(",");

    fireEvent.click(screen.getByRole("button", { name: "Expandir todo" }));
    expect(groups().every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);
    expect(screen.getByRole("link", { name: "Ana Ruiz" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has("abiertos")).toBe(false);

    // "Ir a" expands the group and moves focus to its toggle.
    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    const nav = screen.getByRole("navigation", { name: "Ir a área" });
    fireEvent.click(within(nav).getByRole("link", { name: /Construcción/ }));
    const construccion = groups().find((b) => b.getAttribute("aria-controls") === "g-construccion-rows")!;
    expect(construccion.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps ?abiertos and ?persona", () => {
    window.history.replaceState(null, "", "/personas?abiertos=diseno&persona=ana&tramo=diseno");
    const first = renderTeam();
    expect(screen.getByRole("button", { name: "Contraer Ana Ruiz" })).toBeTruthy();
    expect(screen.getByText("Oficina Polanco")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Luis Pérez" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expandir Valeria Ortiz" }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("persona")).toBe("valeria");
    expect(params.get("abiertos")).toBe("diseno");
    expect(params.get("tramo")).toBe("diseno");

    // A reload reads the same state back.
    first.unmount();
    renderTeam();
    expect(screen.getByRole("button", { name: "Contraer Valeria Ortiz" })).toBeTruthy();
    expect(screen.getByText("Depto Roma Norte")).toBeTruthy();
  });

  it("quick assign shows the impact line and Asignar a", async () => {
    const onCreateTask = vi.fn(async (_assignee: PersonDatum, draft: { title: string }) => ({ id: "t1", title: draft.title }));
    window.history.replaceState(null, "", "/personas?persona=ana");
    renderTeam({ canCreateTask: true, canAssign: true, onCreateTask });

    const input = screen.getByRole("textbox", { name: "Asignar tarea a Ana Ruiz" });
    expect(screen.getByText("Enter crea · Tab acepta")).toBeTruthy();
    fireEvent.input(input, { target: { value: "Revisar planos el viernes" } });

    // Due Friday 20 nov → week 16–22 nov: (5 + 1) ÷ 5 for Ana, (3 + 1) ÷ 5 for Valeria.
    expect(screen.getByText("Lleva la semana 16–22 nov de Ana al 120 %. Valeria queda al 80 %.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Asignar a Valeria" }));
    });
    expect(onCreateTask).toHaveBeenCalledTimes(1);
    const [assignee, draft] = onCreateTask.mock.calls[0]!;
    expect(assignee.id).toBe("valeria");
    expect(draft).toMatchObject({ title: "Revisar planos", projectId: "p1", tramoId: "w-dis", assigneeId: "valeria", dueDate: "2026-11-20" });

    // Without canAssign the impact line stays and the button goes.
    cleanup();
    renderTeam({ canCreateTask: true, canAssign: false, onCreateTask });
    fireEvent.input(screen.getByRole("textbox", { name: "Asignar tarea a Ana Ruiz" }), { target: { value: "Medir" } });
    expect(screen.getByText(/Lleva la semana 9–15 nov de Ana al 140 %\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Asignar a/ })).toBeNull();

    // Enter creates for the person and marks the project "+1 nueva".
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Asignar tarea a Ana Ruiz" }), { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByText("+1 nueva")).toBeTruthy());
    expect(onCreateTask.mock.calls.at(-1)![0].id).toBe("ana");
    expect(screen.getByText("Oficina Polanco").closest("tr")!.className).toContain("row-new");
  });

  it("footer totals and averages skip Vac. cells", () => {
    renderTeam();
    const footer = table().querySelector("tfoot tr")!;
    const cells = Array.from(footer.querySelectorAll("td")).map(text);
    expect(cells).toEqual([
      "Total · 4 personas",
      "",
      "15",
      "5",
      "81 %",
      "81 %",
      // Sofía's week 2 is a whole-week absence: (104 + 75 + 70) ÷ 3.
      "83 %",
      "63 %",
      "45 %",
      "1 libre · 1 saturada",
    ]);
    const sofia = screen.getByRole("link", { name: "Sofía León" }).closest("tr")!;
    expect(text(sofia)).toContain("Vac.");
    expect(within(sofia).getByText("vacaciones toda la semana")).toBeTruthy();
  });

  it("Exportar downloads visible rows", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
    window.history.replaceState(null, "", "/personas?tramo=diseno");
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:csv";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithQueryClient(
      <StyleProvider style="analitico" scope="staff">
        <EquipoAnalitico people={PEOPLE} counts={undefined} canCreate={false} canAssign={false} canCreateTask={false} onAddPerson={vi.fn()} />
      </StyleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe("personas-carga-2026-11-09.csv");
    const csv = await blobs[0]!.text();
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines.map((l) => l.split(";")[0])).toEqual(["Persona", "Ana Ruiz", "Valeria Ortiz"]);
    click.mockRestore();
  });
});
