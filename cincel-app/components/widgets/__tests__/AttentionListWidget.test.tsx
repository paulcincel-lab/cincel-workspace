// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/etapas/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    etapaLabel: (key: string) => labels[key] ?? key,
    etapaColorSlot: (key: string) => slots[key] ?? null,
    etapaColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
    listEtapas: async () => [],
    canSeeAdminData: () => false,
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  ATTENTION_EMPTY_TEXT,
  AttentionListWidget,
  formatAttentionDue,
  formatAttentionLate,
  type AttentionListWidgetProps,
} from "@/components/widgets/AttentionListWidget";
import {
  attentionListEmptyFixture,
  attentionListFixture,
  type AttentionListFixture,
} from "@/components/widgets/fixtures/attention-list";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderWidget(
  style: PresentationStyle,
  fixture: AttentionListFixture = attentionListFixture,
  extra: Partial<AttentionListWidgetProps> = {},
) {
  return render(
    <StyleProvider style={style} scope="staff">
      <AttentionListWidget
        title={fixture.title}
        items={fixture.items}
        totalCount={fixture.totalCount}
        moreHref={fixture.moreHref}
        {...extra}
      />
    </StyleProvider>,
  );
}

function region() {
  return screen.getByRole("region", { name: "Requiere atención" });
}

/** Due dates with a value, in row order. */
function dueTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="attention-due"]'))
    .map((el) => el.textContent ?? "")
    .filter((t) => t !== "—");
}

const EXPECTED_DUES = attentionListFixture.items.filter((i) => i.due).map((i) => formatAttentionDue(i.due));
const TITLES = attentionListFixture.items.map((i) => i.title);

afterEach(() => {
  cleanup();
});

describe("formatters", () => {
  it("formats a date-only due as a lowercase es-MX day and month", () => {
    expect(formatAttentionDue("2026-11-02")).toMatch(/^2 nov/);
    expect(formatAttentionDue("2026-11-02")).toBe(formatAttentionDue("2026-11-02").toLowerCase());
    expect(formatAttentionDue(null)).toBe("—");
    expect(formatAttentionDue("no es fecha")).toBe("—");
  });

  it("formats days late", () => {
    expect(formatAttentionLate(5)).toBe("5 d");
    expect(formatAttentionLate(0)).toBe("—");
    expect(formatAttentionLate(null)).toBe("—");
  });
});

describe("AttentionListWidget", () => {
  it("Visual: rows with etapa bar, reason pill, avatar and due date", () => {
    const { container } = renderWidget("visual");
    expect(region().getAttribute("data-style")).toBe("visual");
    const rows = container.querySelectorAll<HTMLElement>('[data-slot="attention-row"]');
    expect(rows).toHaveLength(5);

    const first = rows[0];
    expect(first.className).toContain("border-l-4");
    expect(first.style.borderLeftColor).toBe("var(--chart-2)");
    expect(rows[4].style.borderLeftColor).toBe("var(--border)");

    expect(within(first).getByRole("link", { name: "Planos de cocina" }).getAttribute("href")).toBe(
      "/tareas?tarea=t-planos-cocina",
    );
    expect(within(first).getByText("Casa Lomas")).toBeTruthy();
    const pill = within(first).getByText("Vencida");
    expect(pill.getAttribute("data-slot")).toBe("badge");
    expect(pill.className).toContain("text-destructive");
    expect(within(rows[2]).getByText("En revisión").className).toContain("text-(--warning-ink)");

    expect(within(first).getByText("Ana Torres").closest(".sr-only")).not.toBeNull();
    expect(within(first).getByTitle("Ana Torres")).toBeTruthy();
    expect(within(first).getByText("AT")).toBeTruthy();
    // Row 3's reason is also "Sin responsable" (pill), so pick the assignee's sr-only label.
    expect(within(rows[3]).getAllByText("Sin responsable").some((el) => el.className.includes("sr-only"))).toBe(true);

    const due = first.querySelector('[data-slot="attention-due"]') as HTMLElement;
    expect(due.className).toContain("font-mono");
    expect(due.className).toContain("text-destructive");
    expect((rows[2].querySelector('[data-slot="attention-due"]') as HTMLElement).className).toContain(
      "text-muted-foreground",
    );
    expect(dueTexts(container)).toEqual(EXPECTED_DUES);
  });

  it("Esencial: title + 'proyecto · persona · motivo fecha', no avatars or pills", () => {
    const { container } = renderWidget("esencial");
    expect(region().getAttribute("data-style")).toBe("esencial");
    const rows = container.querySelectorAll<HTMLElement>('[data-slot="attention-row"]');
    expect(rows).toHaveLength(5);
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();
    expect(container.querySelector('[data-slot="avatar"]')).toBeNull();

    const meta = rows[0].querySelector('[data-slot="attention-meta"]') as HTMLElement;
    expect(meta.textContent).toBe(`Casa Lomas · Ana Torres · Vencida ${EXPECTED_DUES[0]}`);
    expect((meta.querySelector('[data-slot="attention-due"]') as HTMLElement).className).toContain("text-destructive");
    expect(rows[3].querySelector('[data-slot="attention-meta"]')?.textContent).toBe(
      `Oficinas Polanco · Sin responsable · Sin responsable ${EXPECTED_DUES[3]}`,
    );
    expect(rows[4].querySelector('[data-slot="attention-meta"]')?.textContent).toBe(
      "Casa Coyoacán · Sofía Ruiz · Sin fecha",
    );
    expect(dueTexts(container)).toEqual(EXPECTED_DUES);
  });

  it("Analítico: RecordTable with tarea, proyecto, etapa, resp., motivo, vence, retraso", () => {
    const { container } = renderWidget("analitico");
    expect(region().getAttribute("data-style")).toBe("analitico");
    const headers = within(region())
      .getAllByRole("columnheader")
      .map((h) => (h.textContent ?? "").replace(/[▲▼]/g, ""));
    expect(headers).toEqual(["Tarea", "Proyecto", "Etapa", "Resp.", "Motivo", "Vence", "Retraso"]);

    const bodyRows = within(region()).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(5);
    const firstCells = within(bodyRows[0]).getAllByRole("cell");
    expect(within(firstCells[0]).getByRole("link", { name: "Planos de cocina" })).toBeTruthy();
    expect(firstCells[1].textContent).toBe("Casa Lomas");
    expect(firstCells[3].textContent).toBe("AT");
    expect(firstCells[3].querySelector("abbr")?.getAttribute("title")).toBe("Ana Torres");
    expect(firstCells[4].textContent).toBe("Vencida");
    expect(container.querySelector('[data-slot="avatar"]')).toBeNull();

    const late = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="attention-late"]'));
    expect(late.map((el) => el.textContent)).toEqual(["5 d", "2 d", "—", "—", "—"]);
    expect(late[0].className).toContain("text-destructive");
    expect(late[0].className).toContain("font-mono");
    expect(late[2].className).toContain("text-muted-foreground");
    expect(within(bodyRows[4]).getAllByRole("cell")[2].textContent).toBe("—");
    expect(dueTexts(container)).toEqual(EXPECTED_DUES);
  });

  it("renders the same items and numbers in every style and only the chosen style", () => {
    for (const style of STYLES) {
      const { container, unmount } = renderWidget(style);
      // The nested RecordTable (Analítico) carries the same style; nothing else may.
      expect(container.querySelectorAll('[data-style]:not([data-slot="record-table"])')).toHaveLength(1);
      const styles = new Set(Array.from(container.querySelectorAll("[data-style]")).map((n) => n.getAttribute("data-style")));
      expect([...styles]).toEqual([style]);
      for (const title of TITLES) expect(within(region()).getByRole("link", { name: title })).toBeTruthy();
      expect(dueTexts(container)).toEqual(EXPECTED_DUES);
      unmount();
    }
  });

  it("renders the 'Ver más' affordance from totalCount and moreHref", () => {
    for (const style of STYLES) {
      const { unmount } = renderWidget(style);
      const more = within(region()).getByRole("link", { name: "Ver más (7)" });
      expect(more.getAttribute("href")).toBe("/tareas?atencion=1");
      unmount();
    }
  });

  it("shows a plain 'Ver más' link when every item is shown", () => {
    renderWidget("visual", attentionListFixture, { totalCount: 5 });
    expect(screen.getByRole("link", { name: "Ver más" })).toBeTruthy();
  });

  it("shows 'n de total' without a link when there is no moreHref", () => {
    const { container } = renderWidget("visual", attentionListFixture, { moreHref: undefined });
    expect(container.querySelector('[data-slot="attention-more"]')?.textContent).toBe("5 de 7");
    expect(screen.queryByRole("link", { name: /Ver más/ })).toBeNull();
  });

  it("omits the affordance without moreHref and without more items", () => {
    const { container } = renderWidget("visual", attentionListFixture, { moreHref: undefined, totalCount: undefined });
    expect(container.querySelector('[data-slot="attention-more"]')).toBeNull();
  });

  it("renders the empty state line in every style", () => {
    for (const style of STYLES) {
      const { container, unmount } = renderWidget(style, attentionListEmptyFixture, { moreHref: undefined });
      expect(within(region()).getByText(ATTENTION_EMPTY_TEXT)).toBeTruthy();
      expect(container.querySelector('[data-slot="attention-row"]')).toBeNull();
      expect(within(region()).queryByRole("table")).toBeNull();
      unmount();
    }
  });

  it("uses emptyText and emptyState overrides", () => {
    const { unmount } = renderWidget("visual", attentionListEmptyFixture, { emptyText: "Sin tareas atrasadas" });
    expect(screen.getByText("Sin tareas atrasadas")).toBeTruthy();
    unmount();
    renderWidget("esencial", attentionListEmptyFixture, {
      emptyState: { title: "Todo al día", description: "No hay tareas vencidas ni bloqueadas." },
    });
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByText("No hay tareas vencidas ni bloqueadas.")).toBeTruthy();
  });

  it("renders the LoadingSkeleton variant while loading (table in Analítico)", () => {
    const expected: Record<PresentationStyle, string> = { visual: "list", esencial: "list", analitico: "table" };
    for (const style of STYLES) {
      const { container, unmount } = renderWidget(style, attentionListFixture, { loading: true });
      expect(region().getAttribute("aria-busy")).toBe("true");
      expect(container.querySelector('[data-slot="loading-skeleton"]')?.getAttribute("data-variant")).toBe(
        expected[style],
      );
      expect(container.querySelector('[data-slot="attention-row"]')).toBeNull();
      expect(within(region()).queryByRole("table")).toBeNull();
      unmount();
    }
  });

  it("tones the card by the most severe item", () => {
    const { unmount } = renderWidget("visual");
    expect(region().getAttribute("data-tone")).toBe("critical");
    unmount();
    renderWidget("visual", { ...attentionListFixture, items: attentionListFixture.items.slice(2) });
    expect(region().getAttribute("data-tone")).toBe("warn");
  });
});
