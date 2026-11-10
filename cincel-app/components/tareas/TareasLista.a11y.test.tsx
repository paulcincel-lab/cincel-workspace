// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { ListPageProps } from "@/components/patterns/ListPage";
import type { ColorMode, PresentationStyle, ThemeId } from "@/lib/types/redesign";
import type { TramoBoard } from "@/lib/types/core";

import { DISENO, LISTA_TASKS, LISTA_TRAMOS } from "./fixtures/lista-tasks";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=lista&tramo=diseno"),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll,
    onNavigate,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    scroll?: boolean;
    onNavigate?: unknown;
  }) => {
    void scroll;
    void onNavigate;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

const BOARD: TramoBoard = {
  workflow: DISENO,
  ready: [{ project: { id: "p7", name: "Casa Valle" }, currentTramo: null, readySince: "2026-11-02T10:00:00.000Z", pending: null }],
  upcoming: [],
  started: [],
};

vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasStartSlotData: vi.fn(async () => ({ board: BOARD, candidates: [], canStart: true })),
  getTareasPageData: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));
vi.mock("@/lib/actions/tramo-start-actions", () => ({
  previewStartTramoAction: vi.fn(),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" }),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canCreateActivity: true }),
}));
vi.mock("@/components/widgets/TramoBadge", () => ({
  TramoBadge: ({ tramo }: { tramo: { name: string } }) => <span>{tramo.name}</span>,
}));

// The page shell is ListPage's own concern (and its own a11y test); here it
// renders the header, the filters slot and the real RecordTable.
vi.mock("@/components/patterns/ListPage", async () => {
  const { RecordTable } = await import("@/components/widgets/RecordTable");
  return {
    ListPage: (props: ListPageProps) => (
      <main>
        <h1>{props.header.title}</h1>
        {props.filters as ReactNode}
        {props.spec.kind === "table" ? <RecordTable data={props.spec.data} renderCell={props.spec.renderCell} /> : null}
      </main>
    ),
  };
});

import { TareasLista } from "./TareasLista";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf, type TareasListPages } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import type { TaskListRow } from "@/lib/types/core";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";

// The components read the signed-in user from the session store; seed it with the mocked user.
beforeEach(() => seedSessionUser(getCurrentAuthenticatedUser()));

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY, vista: "lista", tramo: "diseno" };

/** The cache `/tareas?vista=lista&tramo=diseno` hydrates. */
function seededClient() {
  const client = createTestQueryClient();
  // The bundle is keyed by the style; seed it for every one the tests render.
  const page = {
    facets: { total: LISTA_TASKS.length, byTramo: {}, projects: [] },
    tramos: LISTA_TRAMOS,
    staff: [],
  };
  for (const estilo of ["visual", "esencial", "analitico"] as const) {
    client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(QUERY, estilo)), page);
  }
  const rows = LISTA_TASKS.map(
    (t) =>
      ({
        ...t,
        subtaskDone: t.subtaskDoneCount,
        commentCount: 0,
        attachmentCount: 0,
        checklistTotal: t.checklist.total,
        checklistDone: t.checklist.completed,
      }) as TaskListRow,
  );
  client.setQueryData<TareasListPages>(qk.tareas.list(tareasListFiltersOf(QUERY)), {
    pages: [{ rows, nextCursor: null, total: rows.length }],
    pageParams: [null],
  });
  return client;
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

const THEMES: ThemeId[] = ["azul", "calido", "grafito"];
const MODES: Exclude<ColorMode, "system">[] = ["light", "dark"];
const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.removeAttribute("data-style");
});

describe("TareasLista accessibility", () => {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      it(`has no serious axe violations in ${theme} ${mode}, all three styles, with the start slot`, async () => {
        document.documentElement.setAttribute("data-theme-id", theme);
        document.documentElement.setAttribute("data-theme", mode);
        for (const style of STYLES) {
          document.documentElement.setAttribute("data-style", style);
          const { container, unmount } = renderWithQueryClient(
            <StyleProvider style={style} scope="staff">
              <TareasLista query={QUERY} header={{ title: "Tareas" }} />
            </StyleProvider>,
            { client: seededClient() },
          );
          expect(await screen.findByText("Listos para iniciar (1)")).toBeTruthy();
          await act(async () => {});
          expect(await seriousViolations(container)).toEqual([]);
          unmount();
        }
      });
    }
  }
});
