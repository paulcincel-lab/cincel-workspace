// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import type { CSSProperties, ReactNode } from "react";

import { GroupedTable } from "@/components/widgets/GroupedTable";
import {
  groupedTaskAnchors,
  groupedTaskColumns,
  groupedTaskGroups,
  groupedTaskHeat,
  groupedTaskTotals,
  type GroupedTaskRow,
} from "@/components/widgets/fixtures/grouped-table";
import { THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";

const MODES = ["light", "dark"] as const;

function themeStyle(mode: (typeof MODES)[number]): CSSProperties {
  const tokens = THEME_PRESETS.azul.tokens;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[`--${name}`] = tokens[name][mode];
  return vars as CSSProperties;
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout; the token pairs are covered by the contrast tests.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderInMode(mode: (typeof MODES)[number], children: ReactNode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
  return render(
    <main lang="es" style={themeStyle(mode)}>
      {children}
    </main>,
  );
}

function table(props: { defaultExpanded?: boolean } = {}) {
  return (
    <GroupedTable<GroupedTaskRow>
      label="Tareas"
      columns={groupedTaskColumns}
      groups={groupedTaskGroups}
      heat={groupedTaskHeat}
      totals={groupedTaskTotals}
      anchors={groupedTaskAnchors}
      anchorsCaption="tareas vencidas por proyecto"
      rowHref={(row) => `/tareas/${row.id}`}
      isRowNew={(row) => row.id === "t1"}
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe.each(MODES)("GroupedTable a11y, %s", (mode) => {
  it("expanded has no serious or critical axe violations", async () => {
    const { container } = renderInMode(mode, table());
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("collapsed has no serious or critical axe violations", async () => {
    const { container } = renderInMode(mode, table({ defaultExpanded: false }));
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("loading, error and empty states have no serious or critical axe violations", async () => {
    for (const node of [
      <GroupedTable<GroupedTaskRow> key="l" label="Tareas" columns={groupedTaskColumns} groups={[]} loading />,
      <GroupedTable<GroupedTaskRow> key="e" label="Tareas" columns={groupedTaskColumns} groups={[]} error={{ onRetry: () => {} }} />,
      <GroupedTable<GroupedTaskRow> key="v" label="Tareas" columns={groupedTaskColumns} groups={[]} />,
    ]) {
      const { container } = renderInMode(mode, node);
      expect(await seriousViolations(container)).toEqual([]);
      cleanup();
    }
  });
});

describe("GroupedTable keyboard and ARIA", () => {
  it("Enter and Space toggle a group header", () => {
    render(table());
    const top = screen.getByRole("button", { name: /^Casa Lomas/ });
    expect(top.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(top, { key: "Enter" });
    expect(top.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(top, { key: " " });
    expect(top.getAttribute("aria-expanded")).toBe("true");
    const child = screen.getByRole("button", { name: /^Diseño/ });
    fireEvent.keyDown(child, { key: " " });
    expect(child.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(child, { key: "Enter" });
    expect(child.getAttribute("aria-expanded")).toBe("true");
  });

  it("aria-expanded and aria-controls match", () => {
    const { container } = render(table());
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[aria-controls]")];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const target = document.getElementById(button.getAttribute("aria-controls") ?? "");
      expect(target).not.toBeNull();
      expect(button.getAttribute("aria-expanded")).toBe(target?.hasAttribute("hidden") ? "false" : "true");
    }
    fireEvent.click(screen.getByRole("button", { name: /^Construcción/ }));
    const construccion = screen.getByRole("button", { name: /^Construcción/ });
    expect(construccion.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(construccion.getAttribute("aria-controls") ?? "")?.hasAttribute("hidden")).toBe(true);
  });

  it("chevrons are hidden from assistive technology", () => {
    const { container } = render(table());
    for (const svg of container.querySelectorAll("button[aria-expanded] svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
