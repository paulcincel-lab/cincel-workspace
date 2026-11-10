// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(""),
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
  getCurrentAuthenticatedUser: () => ({ member: { id: ME, name: "Ana" }, access: "Colaborador" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: true }),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasPageData: vi.fn(async () => ({ facets: { total: 0, byTramo: {}, projects: [] }, tramos: [], staff: [] })),
  getTareasFacets: vi.fn(),
  getTareasByProject: vi.fn(),
  getTareasListPage: vi.fn(async () => ({ rows: [], nextCursor: null, total: 0 })),
}));
vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {actions}
    </header>
  ),
}));
// The quick-add line has its own a11y test (`QuickAddRow`); here a labelled input stands in.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context }: { context: { label: string } }) => (
    <label>
      {context.label}
      <input type="text" />
    </label>
  ),
}));
vi.mock("./quick-add-create", () => ({ useQuickAddCreate: () => ({ create: vi.fn(), undo: vi.fn() }) }));

import { TareasEsencial } from "./TareasEsencial";
import { ESENCIAL_DATA, ESENCIAL_FACETS } from "./fixtures/esencial-groups";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { qk } from "@/lib/query/keys";
import { tareasEsencialFilters, tareasListFiltersOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { DEFAULT_TAREAS_QUERY } from "@/lib/tareas/query";
import { seedSessionUser } from "@/tests/helpers/session-user";

function renderEsencial() {
  const client = createTestQueryClient();
  const f = tareasEsencialFilters(tareasListFiltersOf(DEFAULT_TAREAS_QUERY));
  client.setQueryData(qk.tareas.byProject(f), ESENCIAL_DATA);
  client.setQueryData(qk.tareas.facets(f), ESENCIAL_FACETS);
  return renderWithQueryClient(
    <StyleProvider style="esencial" scope="staff">
      <TareasEsencial />
    </StyleProvider>,
    { client },
  );
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

beforeEach(() => seedSessionUser(getCurrentAuthenticatedUser()));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-style");
});

describe("TareasEsencial accessibility", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`axe clean light and dark (${mode})`, async () => {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.setAttribute("data-style", "esencial");
      const { container } = renderEsencial();
      await act(async () => {});
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("one tab stop per row", () => {
    const { container } = renderEsencial();
    const rows = container.querySelectorAll<HTMLElement>('[data-slot="esencial-row"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const focusable = row.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
      expect(focusable).toHaveLength(1);
      expect(focusable[0].tagName).toBe("A");
      expect(focusable[0].getAttribute("href")).toMatch(/[?&]tarea=/);
    }
    // Each card is a region named by its header link.
    for (const card of container.querySelectorAll('[data-slot="esencial-card"]')) {
      const labelledBy = card.getAttribute("aria-labelledby");
      expect(labelledBy && document.getElementById(labelledBy)?.querySelector("a")).toBeTruthy();
    }
    // The filters are one labelled group.
    expect(screen.getByRole("group", { name: "Filtros" })).toBeTruthy();
  });

  it("aria-expanded toggles", () => {
    renderEsencial();
    const card = screen.getByRole("region", { name: "Casa Lomas" });
    const toggle = within(card).getByRole("button", { name: "2 completadas" });
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const list = document.getElementById(controls!);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(list?.hidden).toBe(true);

    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(list?.hidden).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
