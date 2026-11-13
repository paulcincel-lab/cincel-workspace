// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, scroll, prefetch, ...rest }: { href: string; children: ReactNode; scroll?: boolean; prefetch?: boolean }) => {
    void scroll;
    void prefetch;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

const { ME } = vi.hoisted(() => ({ ME: "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: ME, name: "Ana Ruiz" }, access: "Colaborador" }),
}));
const caps = vi.hoisted(() => ({ canCreateActivity: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: caps.canCreateActivity }),
}));

const pageData = vi.hoisted(() => ({
  getTareasPageData: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasByProject: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);

vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p data-testid="page-description">{description}</p> : null}
      {actions}
    </header>
  ),
}));

// The quick-add line itself is covered by `QuickAddRow.test.tsx`: here it shows the context it got.
type QuickAddProps = import("@/components/widgets/QuickAddRow").QuickAddRowProps;
const quickAddRows = vi.hoisted(() => [] as QuickAddProps[]);
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: (props: QuickAddProps) => {
    quickAddRows.push(props);
    return <div data-testid="quick-add" data-project={props.context.projectId ?? ""} data-variant={props.variant} />;
  },
}));
const quickAdd = vi.hoisted(() => ({ create: vi.fn(), undo: vi.fn() }));
vi.mock("./quick-add-create", () => ({ useQuickAddCreate: () => quickAdd }));

import { TareasEsencial, overdueLabel, taskCountLabel } from "./TareasEsencial";
import { ESENCIAL_DATA, ESENCIAL_FACETS, ESENCIAL_ETAPAS, LOMAS_GROUP, esencialRow } from "./fixtures/esencial-groups";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { qk } from "@/lib/query/keys";
import { tareasEsencialFilters, tareasListFiltersOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetQuickAddRecent, useQuickAddRecent } from "@/lib/stores/quick-add-store";
import type { TareasByProject } from "@/lib/tareas/page-data";
import { parseTareasQuery } from "@/lib/tareas/query";
import { seedSessionUser } from "@/tests/helpers/session-user";

/** The resolved filters the component keys its reads with, for `nav.search`. */
function esencialFilters() {
  return tareasEsencialFilters(tareasListFiltersOf(parseTareasQuery(new URLSearchParams(nav.search))));
}

function renderEsencial(data: TareasByProject = ESENCIAL_DATA) {
  const client = createTestQueryClient();
  const f = esencialFilters();
  client.setQueryData(qk.tareas.byProject(f), data);
  client.setQueryData(qk.tareas.facets(f), ESENCIAL_FACETS);
  const view = renderWithQueryClient(<TareasEsencial />, { client });
  return { ...view, client, f };
}

const replaceState = vi.spyOn(window.history, "replaceState");

beforeEach(() => {
  nav.search = "";
  caps.canCreateActivity = true;
  quickAddRows.length = 0;
  resetQuickAddRecent();
  replaceState.mockClear();
  seedSessionUser(getCurrentAuthenticatedUser());
  pageData.getTareasPageData.mockResolvedValue({ facets: ESENCIAL_FACETS, etapas: ESENCIAL_ETAPAS, staff: [] });
  pageData.getTareasFacets.mockResolvedValue(ESENCIAL_FACETS);
  pageData.getTareasByProject.mockResolvedValue(ESENCIAL_DATA);
  pageData.getTareasListPage.mockReset();
  quickAdd.create.mockReset();
});

afterEach(() => cleanup());

function card(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("TareasEsencial", () => {
  it("card meta plural and al día", () => {
    renderEsencial();
    expect(taskCountLabel(1)).toBe("1 tarea");
    expect(taskCountLabel(3)).toBe("3 tareas");
    expect(overdueLabel(1)).toBe("1 en retraso");
    expect(overdueLabel(2)).toBe("2 en retraso");

    const lomasMeta = card("Casa Lomas").querySelector('[data-slot="esencial-card-meta"]');
    expect(lomasMeta?.textContent).toBe("3 tareas · 1 en retraso");
    expect(within(lomasMeta as HTMLElement).getByText("1 en retraso").className).toContain("text-destructive");
    const romaMeta = card("Depto Roma").querySelector('[data-slot="esencial-card-meta"]');
    expect(romaMeta?.textContent).toBe("1 tarea · al día");
    // The description names the signed-in user; Solo mías is pressed by default.
    expect(screen.getByTestId("page-description").textContent).toBe(
      "Mis tareas por proyecto: lo que tienes asignado, Ana.",
    );
    expect(screen.getByRole("button", { name: "Solo mías" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("status chip is last", () => {
    const { container } = renderEsencial();
    const rows = container.querySelectorAll('[data-slot="esencial-row"]');
    expect(rows.length).toBe(4);
    for (const row of rows) expect(row.lastElementChild?.getAttribute("data-slot")).toBe("esencial-status");
    expect(container.querySelector("table")).toBeNull();
    // Projects in the loader's order: most overdue first.
    const titles = [...container.querySelectorAll('[data-slot="esencial-card"] h2')].map((h) => h.textContent);
    expect(titles).toEqual(["Casa Lomas", "Depto Roma"]);
    // The overdue date reads in destructive.
    const late = within(card("Casa Lomas")).getByText("2 nov");
    expect(late.className).toContain("text-destructive");
  });

  it("quick-add assigns to me and inserts into the card", async () => {
    const { client, f } = renderEsencial();
    const forLomas = quickAddRows.find((p) => p.context.projectId === "p1");
    expect(forLomas?.variant).toBe("row");
    expect(forLomas?.context.assigneeId).toBe(ME);
    expect(forLomas?.context.label).toBe("Nueva tarea en Casa Lomas");
    expect(within(card("Casa Lomas")).getByTestId("quick-add")).toBeTruthy();

    quickAdd.create.mockResolvedValue({ id: "t9", title: "Revisar acabados" });
    const draft = {
      title: "Revisar acabados",
      projectId: "p1",
      etapaId: null,
      assigneeId: ME,
      dueDate: null,
      priority: "media" as const,
    };
    await act(async () => {
      await forLomas!.onCreate(draft);
    });
    expect(quickAdd.create).toHaveBeenCalledWith(draft);
    expect(screen.getByText("Tarea creada")).toBeTruthy();

    // The quick-add line marks the task; the refetched card then holds its row with `row-new`.
    act(() => {
      useQuickAddRecent.getState().markCreated("t9");
      client.setQueryData<TareasByProject>(qk.tareas.byProject(f), {
        ...ESENCIAL_DATA,
        groups: [
          {
            ...LOMAS_GROUP,
            open: 4,
            rows: [...LOMAS_GROUP.rows, esencialRow({ id: "t9", title: "Revisar acabados", projectId: "p1" })],
          },
          ...ESENCIAL_DATA.groups.slice(1),
        ],
      });
    });
    const link = within(card("Casa Lomas")).getByRole("link", { name: "Revisar acabados" });
    expect(link.closest('[data-slot="esencial-row"]')?.className).toContain("row-new");
    expect(card("Casa Lomas").querySelector('[data-slot="esencial-card-meta"]')?.textContent).toBe(
      "4 tareas · 1 en retraso",
    );
  });

  it("hides the quick-add without the create permission", () => {
    caps.canCreateActivity = false;
    renderEsencial();
    expect(screen.queryByTestId("quick-add")).toBeNull();
    expect(screen.queryByRole("button", { name: /Nueva tarea/ })).toBeNull();
  });

  it("completadas expands and fetches once", async () => {
    pageData.getTareasListPage.mockResolvedValue({
      rows: [esencialRow({ id: "t7", title: "Levantamiento", status: "completado", projectId: "p1" })],
      nextCursor: null,
      total: 1,
    });
    renderEsencial();
    const toggle = within(card("Casa Lomas")).getByRole("button", { name: "2 completadas" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(pageData.getTareasListPage).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(within(card("Casa Lomas")).getByText("Levantamiento")).toBeTruthy());
    expect(pageData.getTareasListPage).toHaveBeenCalledTimes(1);
    const [input] = pageData.getTareasListPage.mock.calls[0];
    expect(input.filters).toMatchObject({ proyecto: "p1", estado: "completado", responsable: "yo" });

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(pageData.getTareasListPage).toHaveBeenCalledTimes(1);
  });

  it("row opens ?tarea=", () => {
    nav.search = "estilo=esencial";
    renderEsencial();
    const link = within(card("Casa Lomas")).getByRole("link", { name: "Render del lobby" });
    // The current URL (the style preview included) plus `tarea`: the sheet opens over the cards.
    expect(link.getAttribute("href")).toBe("/tareas?estilo=esencial&tarea=t1");
    expect(within(card("Casa Lomas")).getByRole("link", { name: "Casa Lomas" }).getAttribute("href")).toBe(
      "/proyectos/p1",
    );
  });

  it("Solo mías off writes responsable=todos", () => {
    renderEsencial();
    fireEvent.click(screen.getByRole("button", { name: "Solo mías" }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/tareas?responsable=todos");
  });

  it("empty states with and without filters", () => {
    const empty: TareasByProject = { groups: [], truncated: false };
    renderEsencial(empty);
    expect(screen.getByText("No tienes tareas asignadas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/tareas?responsable=todos");
    cleanup();

    nav.search = "etapa=diseno";
    renderEsencial(empty);
    expect(screen.getByText("No hay tareas con estos filtros")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/tareas");
  });

  it("notes the 200-row cap with a link to Analítico", () => {
    renderEsencial({ ...ESENCIAL_DATA, truncated: true });
    const note = screen.getByRole("link", { name: "Mostrando 200 tareas. Ver todas en Analítico" });
    expect(note.getAttribute("href")).toBe("/tareas?responsable=yo&estilo=analitico");
  });
});
