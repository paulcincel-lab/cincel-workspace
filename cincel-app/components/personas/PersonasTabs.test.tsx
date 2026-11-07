// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";

import { PersonasTabs } from "./PersonasTabs";

const counts = { equipo: 12, clientes: 30, contratistas: 4, proveedores: 9 };

afterEach(cleanup);

function hrefs() {
  return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

describe("PersonasTabs", () => {
  it("renders the four tabs as links with their counts and marks the active one", () => {
    render(<PersonasTabs active="clientes" counts={counts} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Equipo12", "Clientes30", "Contratistas4", "Proveedores9"]);
    expect(screen.getByRole("link", { name: /Clientes/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Equipo/ }).getAttribute("aria-current")).toBeNull();
    expect(hrefs()).toEqual(["/personas", "/personas/clientes", "/personas/contratistas", "/personas/proveedores"]);
  });

  it.each<PresentationStyle>(["visual", "esencial", "analitico"])(
    "keeps a ?estilo=%s override when switching tabs",
    (style) => {
      render(
        <StyleProvider style={style} scope="staff" isOverridden>
          <PersonasTabs active="equipo" counts={counts} />
        </StyleProvider>,
      );
      expect(hrefs()).toEqual([
        `/personas?estilo=${style}`,
        `/personas/clientes?estilo=${style}`,
        `/personas/contratistas?estilo=${style}`,
        `/personas/proveedores?estilo=${style}`,
      ]);
    },
  );

  it("keeps the saved style without turning it into an override", () => {
    render(
      <StyleProvider style="analitico" scope="staff">
        <PersonasTabs active="equipo" counts={counts} />
      </StyleProvider>,
    );
    // The saved preference already applies on every tab; no ?estilo= is added.
    expect(hrefs().every((href) => !href?.includes("estilo="))).toBe(true);
  });
});
