// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { STATUS_CHIP_EMPTY_TEXT, StatusChip, statusChipModel } from "@/components/widgets/StatusChip";
import { STATUS_EXPECTED, STATUS_FIXTURE } from "@/components/widgets/fixtures/status-adapters";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: (props: { variant: string; rows?: number }) => (
    <div data-testid="loading-skeleton" data-variant={props.variant} data-rows={props.rows} />
  ),
}));

afterEach(cleanup);

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const KEYS = Object.keys(STATUS_FIXTURE) as (keyof typeof STATUS_FIXTURE)[];

function renderIn(style: PresentationStyle, ui: ReactNode) {
  return render(
    <StyleProvider style={style} scope="staff">
      {ui}
    </StyleProvider>
  );
}

describe("statusChipModel", () => {
  it.each(KEYS)("maps %s to its label and color token", (key) => {
    expect(statusChipModel(STATUS_FIXTURE[key])).toEqual(STATUS_EXPECTED[key]);
  });

  it("colors a non-closing custom status by its stored base status", () => {
    const model = statusChipModel({
      status: "bloqueado",
      customStatus: { id: "cs", name: "Esperando cliente", closes: false, countsAsCompleted: false },
    });
    expect(model).toEqual({ label: "Esperando cliente", token: "destructive" });
  });
});

describe("StatusChip per style", () => {
  it.each(KEYS)("renders the same label for %s in all three styles", (key) => {
    for (const style of STYLES) {
      const { container, unmount } = renderIn(style, <StatusChip status={STATUS_FIXTURE[key]} />);
      expect(container.textContent).toBe(STATUS_EXPECTED[key].label);
      unmount();
    }
  });

  it("Visual renders the tinted StatusBadge chip with the status dot", () => {
    const { container } = renderIn("visual", <StatusChip status={STATUS_FIXTURE.bloqueado} />);
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("bg-destructive/10");
    expect(container.querySelector(".bg-destructive")).not.toBeNull();
  });

  it.each(["esencial", "analitico"] as const)("%s renders plain text, no chip or tint", (style) => {
    const { container } = renderIn(style, <StatusChip status={STATUS_FIXTURE.enProceso} />);
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();
    expect(container.querySelector('[class*="bg-chart"]')).toBeNull();
    expect(container.querySelector('[data-slot="status-chip"]')?.getAttribute("data-token")).toBe("chart-2");
    expect(container.textContent).toBe("En proceso");
  });

  it("renders only the chosen style", () => {
    const { container } = renderIn("visual", <StatusChip status={STATUS_FIXTURE.pendiente} />);
    expect(container.querySelectorAll('[data-slot="status-chip"]')).toHaveLength(1);
  });

  it("size md enlarges the chip in Visual and the text elsewhere", () => {
    const visual = renderIn("visual", <StatusChip status={STATUS_FIXTURE.pendiente} size="md" />);
    expect(visual.container.querySelector('[data-slot="badge"]')!.className).toContain("h-6");
    visual.unmount();
    const esencial = renderIn("esencial", <StatusChip status={STATUS_FIXTURE.pendiente} size="md" />);
    expect(esencial.container.querySelector('[data-slot="status-chip"]')!.className).toContain("text-sm");
  });

  it("size sm is the default badge height", () => {
    const { container } = renderIn("visual", <StatusChip status={STATUS_FIXTURE.pendiente} />);
    expect(container.querySelector('[data-slot="badge"]')!.className).not.toContain("h-6");
  });
});

describe("StatusChip states", () => {
  it.each(STYLES)("renders the default empty text in %s", (style) => {
    const { container } = renderIn(style, <StatusChip status={null} />);
    expect(container.textContent).toBe(STATUS_CHIP_EMPTY_TEXT);
  });

  it("renders a custom empty text", () => {
    const { container } = renderIn("visual", <StatusChip status={null} emptyText="Sin asignar" />);
    expect(container.textContent).toBe("Sin asignar");
  });

  it.each(STYLES)("renders the list LoadingSkeleton while loading in %s", (style) => {
    const { getByTestId, container } = renderIn(style, <StatusChip status={STATUS_FIXTURE.pendiente} loading />);
    expect(getByTestId("loading-skeleton").getAttribute("data-variant")).toBe("list");
    expect(container.textContent).toBe("");
  });
});
