import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProjectTramo } from "@/lib/types/core";
import { TramoChips } from "./TramoChips";

const tramo = (over: Partial<ProjectTramo>): ProjectTramo => ({
  id: "t",
  key: "t",
  name: "T",
  sortOrder: 0,
  startedAt: "2026-01-01",
  closedAt: null,
  current: false,
  ...over,
});

describe("TramoChips", () => {
  it("renders one chip per tramo in tramo order, marking closed ones", () => {
    render(
      <TramoChips
        tramos={[
          tramo({ id: "c", name: "Construcción", sortOrder: 2, current: true }),
          tramo({ id: "p", name: "Presale", sortOrder: 0, closedAt: "2026-02-01" }),
          tramo({ id: "d", name: "Diseño", sortOrder: 1 }),
        ]}
      />,
    );
    const chips = document.querySelectorAll('[data-slot="badge"]');
    expect([...chips].map((c) => c.textContent)).toEqual(["Presale", "Diseño", "Construcción"]);
    expect(screen.getByLabelText("Presale, cerrado")).toBeTruthy();
    expect(screen.getByText("Construcción").getAttribute("data-variant")).toBe("default");
    expect(screen.getByText("Diseño").getAttribute("data-variant")).toBe("outline");
  });

  it("renders nothing without tramos", () => {
    const { container } = render(<TramoChips tramos={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
