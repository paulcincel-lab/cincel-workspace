// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
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
  default: ({ href, children, scroll, ...rest }: { href: string; children: ReactNode; scroll?: boolean }) => {
    void scroll;
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

vi.mock("@/lib/tramos/compat", () => ({
  tramoStart: { fetchBoard: async () => BOARD, fetchCandidates: async () => [] },
  canSeeAdminData: () => true,
}));
vi.mock("@/lib/actions/tramo-start-actions", () => ({
  fetchTramoBoardAction: vi.fn(),
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
          const { container, unmount } = render(
            <StyleProvider style={style} scope="staff">
              <TareasLista tasks={LISTA_TASKS} header={{ title: "Tareas" }} tramo="diseno" tramos={LISTA_TRAMOS} />
            </StyleProvider>,
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
