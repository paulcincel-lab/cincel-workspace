// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TramoBadge } from "./TramoBadge";

afterEach(cleanup);

describe("TramoBadge", () => {
  it("shows the etapa name with its color dot", () => {
    const { container } = render(
      <TramoBadge tramo={{ id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 }} />
    );
    expect(screen.getByText("Diseño")).toBeTruthy();
    expect(container.querySelector("[aria-hidden].bg-chart-2")).not.toBeNull();
  });

  it("reads Sin etapa with the neutral dot when there is no etapa", () => {
    const { container } = render(<TramoBadge tramo={null} />);
    expect(screen.getByText("Sin etapa")).toBeTruthy();
    expect(container.querySelector("[aria-hidden].bg-muted-foreground")).not.toBeNull();
  });
});
