// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";

import { EntityCardFooter, type EntityCardFooterProps } from "./EntityCardFooter";

const PROPS: EntityCardFooterProps = {
  steps: [
    { key: "presale", label: "Presale", state: "done", colorVar: "var(--chart-1)" },
    { key: "diseno", label: "Diseño", state: "current", colorVar: "var(--chart-2)" },
    { key: "construccion", label: "Construcción", state: "next", colorVar: "var(--chart-3)" },
  ],
  stepsLabel: "Etapas",
  people: [
    { id: "s1", name: "Ana López", initials: "AL" },
    { id: "s2", name: "Luis Paz", initials: "LP" },
  ],
  peopleLabel: "Equipo",
};

function renderIn(style: PresentationStyle, props: EntityCardFooterProps = PROPS) {
  return render(
    <StyleProvider style={style} scope="staff">
      <EntityCardFooter {...props} />
    </StyleProvider>,
  );
}

afterEach(() => cleanup());

describe("EntityCardFooter", () => {
  it("Visual: step bar with each state and the team avatars", () => {
    const { container } = renderIn("visual");
    expect(screen.getByRole("img", { name: "Etapas: Presale terminado, Diseño actual, Construcción pendiente" })).toBeTruthy();
    expect([...container.querySelectorAll("[data-step]")].map((s) => s.getAttribute("data-state"))).toEqual([
      "done",
      "current",
      "next",
    ]);
    const team = screen.getByRole("list", { name: "Equipo" });
    expect(team.textContent).toContain("Ana López");
    expect(team.textContent).toContain("LP");
  });

  it("Esencial renders nothing (the card text carries the same facts)", () => {
    const { container } = renderIn("esencial");
    expect(container.textContent).toBe("");
  });

  it("Analítico renders nothing (the table carries the same facts)", () => {
    const { container } = renderIn("analitico");
    expect(container.textContent).toBe("");
  });

  it("renders nothing without steps or people", () => {
    const { container } = renderIn("visual", {});
    expect(container.textContent).toBe("");
  });

  it("has no serious axe violations", async () => {
    const { container } = renderIn("visual");
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
