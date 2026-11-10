// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";

vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: (props: { variant: string; rows?: number }) => (
    <div data-testid="loading-skeleton" data-variant={props.variant} />
  ),
}));
vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: (props: { title: string; description?: string; action?: { label: string } }) => (
    <div data-testid="empty-state">
      <p>{props.title}</p>
      {props.description ? <p>{props.description}</p> : null}
      {props.action ? <span>{props.action.label}</span> : null}
    </div>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  ENTITY_GRID_DEFAULT_MIN_WIDTH,
  ENTITY_GRID_EMPTY_TITLE,
  EntityCardGrid,
  entityTableData,
  formatProgress,
  resolveIconName,
  type EntityCardGridProps,
} from "@/components/widgets/EntityCardGrid";
import {
  entityCardEmptyFixture,
  entityCardLibraryFixture,
  entityCardProjectsFixture,
  entityCardProjectsTableFixture,
} from "@/components/widgets/fixtures/entity-card-grid";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { EntityCard } from "@/lib/types/widgets";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderGrid(style: PresentationStyle, props: Partial<EntityCardGridProps> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <EntityCardGrid items={entityCardProjectsFixture} {...props} />
    </StyleProvider>,
  );
}

/** Text of `[data-value=key]` inside the element(s) of one item, in any style. */
function valueOf(container: HTMLElement, item: EntityCard, key: string): string {
  const el = container.querySelector(`[data-item="${item.id}"] [data-value="${key}"], [data-item="${item.id}"][data-value="${key}"]`);
  return el?.textContent?.trim() ?? "";
}

/** Every number of the fixture as each style must show it: progress and meta values per item. */
function expectedNumbers(items: EntityCard[]) {
  return items.map((item) => ({
    progress: item.progress !== undefined ? formatProgress(item.progress) : "",
    meta: (item.meta ?? []).map((m) => m.value),
  }));
}

function shownNumbers(container: HTMLElement, items: EntityCard[]) {
  return items.map((item) => ({
    progress: item.progress !== undefined ? valueOf(container, item, "progress") : "",
    meta: (item.meta ?? []).map((m) => valueOf(container, item, `meta:${m.label}`)),
  }));
}

afterEach(() => {
  cleanup();
});

describe("EntityCardGrid", () => {
  it("Visual: card grid with tinted head, progress ring, badges, meta and title links", () => {
    const { container } = renderGrid("visual");
    const root = container.querySelector('[data-slot="entity-card-grid"]');
    expect(root?.getAttribute("data-style")).toBe("visual");
    expect(container.querySelector('[data-slot="entity-grid"]')).not.toBeNull();
    expect(container.querySelector("table")).toBeNull();

    expect(shownNumbers(container, entityCardProjectsFixture)).toEqual(expectedNumbers(entityCardProjectsFixture));

    const cards = container.querySelectorAll('[data-slot="card"][data-item]');
    expect(cards).toHaveLength(entityCardProjectsFixture.length);
    // Tramo items get the tinted 84 px head and a 52 px ring.
    expect(container.querySelectorAll('[data-slot="entity-head"]')).toHaveLength(entityCardProjectsFixture.length);
    expect(container.querySelectorAll('[data-slot="entity-progress"]')).toHaveLength(entityCardProjectsFixture.length);
    // Cards carry the tramo color for the tint.
    const first = cards[0] as HTMLElement;
    expect(first.style.getPropertyValue("--entity-color")).toMatch(/^var\(--chart-[1-3]\)$/);
    expect(first.className).toContain("shadow-sm");

    for (const item of entityCardProjectsFixture) {
      expect(screen.getByRole("link", { name: item.title }).getAttribute("href")).toBe(item.href);
      for (const badge of item.badges ?? []) expect(screen.getByText(badge.label)).toBeTruthy();
    }
  });

  it("Visual: items without a tramo render an icon chip instead of a tinted head", () => {
    const { container } = renderGrid("visual", { items: entityCardLibraryFixture });
    expect(container.querySelector('[data-slot="entity-head"]')).toBeNull();
    expect(container.querySelectorAll('[data-slot="entity-icon"]')).toHaveLength(entityCardLibraryFixture.length);
    expect(shownNumbers(container, entityCardLibraryFixture)).toEqual(expectedNumbers(entityCardLibraryFixture));
  });

  it("Esencial: white bordered cards with title and text meta, no tints, rings or shadow", () => {
    const { container } = renderGrid("esencial");
    expect(container.querySelector('[data-slot="entity-card-grid"]')?.getAttribute("data-style")).toBe("esencial");
    expect(container.querySelector('[data-slot="entity-grid"]')).not.toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[data-slot="entity-head"]')).toBeNull();
    expect(container.querySelector('[data-slot="entity-progress"]')).toBeNull();
    expect(container.querySelector('[data-slot="entity-icon"]')).toBeNull();
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();

    expect(shownNumbers(container, entityCardProjectsFixture)).toEqual(expectedNumbers(entityCardProjectsFixture));

    const cards = container.querySelectorAll<HTMLElement>('[data-slot="card"][data-item]');
    expect(cards).toHaveLength(entityCardProjectsFixture.length);
    for (const card of cards) {
      expect(card.className).toContain("shadow-none");
      expect(card.className).toContain("border");
    }
    for (const item of entityCardProjectsFixture) {
      expect(screen.getByRole("link", { name: item.title }).getAttribute("href")).toBe(item.href);
      for (const badge of item.badges ?? []) expect(screen.getByText(badge.label)).toBeTruthy();
    }
  });

  it("Analítico: renders a table built from title, subtitle and meta with the same numbers", () => {
    const { container } = renderGrid("analitico");
    expect(container.querySelector('[data-slot="entity-card-grid"]')?.getAttribute("data-style")).toBe("analitico");
    expect(container.querySelector('[data-slot="entity-grid"]')).toBeNull();
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();

    for (const header of ["Nombre", "Detalle", "Tramo", "Avance", "Abiertas", "Vencidas", "Próxima entrega", "Estado"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(shownNumbers(container, entityCardProjectsFixture)).toEqual(expectedNumbers(entityCardProjectsFixture));
    for (const item of entityCardProjectsFixture) {
      expect(screen.getByRole("link", { name: item.title }).getAttribute("href")).toBe(item.href);
      expect(valueOf(container, item, "subtitle")).toBe(item.subtitle);
    }
  });

  it("Analítico: renders the given table when there is one", () => {
    renderGrid("analitico", { table: entityCardProjectsTableFixture });
    expect(screen.getByRole("columnheader", { name: "Proyecto" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Nombre" })).toBeNull();
    for (const item of entityCardProjectsFixture) {
      expect(screen.getByRole("link", { name: item.title }).getAttribute("href")).toBe(item.href);
    }
  });

  it("Visual and Esencial ignore the table; only the chosen style renders", () => {
    for (const style of ["visual", "esencial"] as const) {
      const { container, unmount } = renderGrid(style, { table: entityCardProjectsTableFixture });
      expect(container.querySelector("table")).toBeNull();
      expect(container.querySelectorAll('[data-slot="entity-card-grid"]')).toHaveLength(1);
      unmount();
    }
  });

  it.each(["visual", "esencial"] as const)("%s: renders the footer per card and honors minWidth", (style) => {
    const { container } = renderGrid(style, {
      minWidth: 220,
      footer: (item) => <button type="button">Abrir {item.title}</button>,
    });
    expect(container.querySelectorAll('[data-slot="entity-footer"]')).toHaveLength(entityCardProjectsFixture.length);
    for (const item of entityCardProjectsFixture) {
      expect(screen.getByRole("button", { name: `Abrir ${item.title}` })).toBeTruthy();
    }
    const grid = container.querySelector<HTMLElement>('[data-slot="entity-grid"]');
    expect(grid?.style.gridTemplateColumns).toContain("220px");
  });

  it("uses the default minimum card width and skips empty footers", () => {
    const { container } = renderGrid("visual", { footer: () => null });
    const grid = container.querySelector<HTMLElement>('[data-slot="entity-grid"]');
    expect(grid?.style.gridTemplateColumns).toContain(`${ENTITY_GRID_DEFAULT_MIN_WIDTH}px`);
    expect(container.querySelector('[data-slot="entity-footer"]')).toBeNull();
  });

  it.each(STYLES)("%s: empty state with the default copy", (style) => {
    const { container } = renderGrid(style, { items: entityCardEmptyFixture });
    expect(container.querySelector('[data-slot="entity-empty"]')).not.toBeNull();
    expect(screen.getByTestId("empty-state").textContent).toContain(ENTITY_GRID_EMPTY_TITLE);
    expect(container.querySelector('[data-slot="entity-grid"]')).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it.each(STYLES)("%s: empty state through the emptyState prop", (style) => {
    renderGrid(style, {
      items: entityCardEmptyFixture,
      emptyState: { icon: FolderOpen, title: "Sin proyectos", description: "Crea el primer proyecto.", action: { label: "Nuevo proyecto", href: "/proyectos?nuevo=1" } },
    });
    const empty = screen.getByTestId("empty-state");
    expect(empty.textContent).toContain("Sin proyectos");
    expect(empty.textContent).toContain("Crea el primer proyecto.");
    expect(empty.textContent).toContain("Nuevo proyecto");
  });

  it.each([
    ["visual", "cards"],
    ["esencial", "cards"],
    ["analitico", "table"],
  ] as const)("%s: loading renders the %s LoadingSkeleton", (style, variant) => {
    const { container } = renderGrid(style, { loading: true });
    expect(screen.getByTestId("loading-skeleton").getAttribute("data-variant")).toBe(variant);
    expect(container.querySelector('[data-slot="entity-grid"]')).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("builds the Analítico table only from the fields the items carry", () => {
    const data = entityTableData(entityCardLibraryFixture);
    expect(data.columns.map((c) => c.label)).toEqual(["Nombre", "Detalle", "Archivos", "Actualizado", "Estado"]);
    expect(data.rows[0]).toMatchObject({ id: "s-book", title: "Book", "meta:Archivos": "24", "meta:Actualizado": "28 oct", badges: null });
    expect(data.rows[1]).toMatchObject({ badges: "Nuevo" });
  });

  it("resolves lucide icon names in kebab or Pascal case and rejects unknown names", () => {
    expect(resolveIconName("folder-kanban")).toBe("folder-kanban");
    expect(resolveIconName("FileText")).toBe("file-text");
    expect(resolveIconName("book_open")).toBe("book-open");
    expect(resolveIconName("no-such-icon-name")).toBeNull();
    expect(resolveIconName(undefined)).toBeNull();
  });

  it("formats progress as a rounded, clamped percentage", () => {
    expect(formatProgress(82)).toBe("82%");
    expect(formatProgress(57.6)).toBe("58%");
    expect(formatProgress(140)).toBe("100%");
    expect(formatProgress(-3)).toBe("0%");
  });
});

describe("EntityCardGrid · Visual progress ring", () => {
  it("ring offset equals 100 minus percent", () => {
    const { container } = renderGrid("visual");
    for (const item of entityCardProjectsFixture.filter((i) => i.progress !== undefined)) {
      const pct = Math.max(0, Math.min(100, Math.round(item.progress!)));
      const ring = container.querySelector(`[data-item="${item.id}"] [data-slot="entity-progress"]`)!;
      expect(ring.getAttribute("role")).toBe("img");
      expect(ring.getAttribute("aria-label")).toBe(`${pct} % de avance`);
      const fill = ring.querySelector('[data-slot="progress-ring-fill"]')!;
      expect(fill.getAttribute("pathLength")).toBe("100");
      expect(fill.getAttribute("class")).toBe("ring");
      expect(fill.getAttribute("stroke-dashoffset")).toBe(String(100 - pct));
      expect((fill as SVGElement).style.getPropertyValue("--ring-offset")).toBe(String(100 - pct));
    }
  });
});
