// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { qk } from "@/lib/query/keys";

const m = vi.hoisted(() => ({
  style: "analitico" as "visual" | "esencial" | "analitico",
  routerSearch: "",
  /** A stand-in view with one row whose click calls `onOpen`. */
  rowView: (name: string) =>
    function View({ onOpen }: { onOpen(code: string): void }) {
      return createElement("button", { type: "button", onClick: () => onOpen("SOL-0001") }, name);
    },
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(m.routerSearch) }));
vi.mock("@/lib/actions/mejoras-actions", () => ({ mejorasCountsAction: vi.fn() }));
vi.mock("@/components/widgets/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/widgets/KpiStrip", () => ({ KpiStrip: () => null }));
vi.mock("@/components/widgets/PageStyleLayout", () => ({
  PageStyleLayout: (props: Record<"visual" | "esencial" | "analitico", () => ReactNode>) => <>{props[m.style]()}</>,
}));
vi.mock("@/components/widgets/mejoras/MejorasVisual", () => ({ MejorasVisual: m.rowView("visual-row") }));
vi.mock("@/components/widgets/mejoras/MejorasEsencial", () => ({ MejorasEsencial: m.rowView("esencial-row") }));
vi.mock("@/components/widgets/mejoras/MejorasAnalitico", () => ({ MejorasAnalitico: m.rowView("analitico-row") }));
vi.mock("@/components/widgets/mejoras/TicketDetailDrawer", () => ({
  TicketDetailDrawer: ({ code, onClose }: { code: string | null; onClose(): void }) =>
    code ? (
      <aside aria-label="detalle">
        {code}
        <button type="button" onClick={onClose}>
          cerrar
        </button>
      </aside>
    ) : null,
}));

import { MejorasClient } from "./MejorasClient";

function renderPage() {
  const client = createTestQueryClient();
  client.setQueryData(qk.mejoras.counts(), {
    byStatus: { nuevo: 1, en_revision: 0, planeado: 0, en_progreso: 0, resuelto: 0, descartado: 0 },
    nuevo: 1,
    total: 1,
  });
  return renderWithQueryClient(<MejorasClient />, { client });
}

beforeEach(() => {
  m.routerSearch = "";
  window.history.replaceState(null, "", "/mejoras");
});
afterEach(cleanup);

describe("MejorasClient row click", () => {
  for (const style of ["visual", "esencial", "analitico"] as const) {
    it(`${style}: a click opens the drawer at once, shares the URL and closes`, () => {
      m.style = style;
      renderPage();
      expect(screen.queryByLabelText("detalle")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: `${style}-row` }));
      expect(screen.getByLabelText("detalle").textContent).toContain("SOL-0001");
      expect(window.location.search).toBe("?solicitud=SOL-0001");
      fireEvent.click(screen.getByRole("button", { name: "cerrar" }));
      expect(window.location.search).not.toContain("solicitud");
    });
  }

  it("opens from a direct link", () => {
    m.style = "analitico";
    m.routerSearch = "solicitud=SOL-0001";
    window.history.replaceState(null, "", "/mejoras?solicitud=SOL-0001");
    renderPage();
    expect(screen.getByLabelText("detalle").textContent).toContain("SOL-0001");
  });
});
