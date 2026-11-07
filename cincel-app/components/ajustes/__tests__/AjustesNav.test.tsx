// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const projectFlow = vi.hoisted(() => ({ pages: { tramos: true, puestos: true } }));
vi.mock("@/lib/auth/ajustes-segments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/ajustes-segments")>();
  return { ...actual, PROJECT_FLOW_SETTINGS_PAGES: projectFlow.pages };
});

const nav = vi.hoisted(() => ({ pathname: "/ajustes/apariencia" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { AjustesNav, ajustesNavKeyFromPath } from "../AjustesNav";
import { AjustesNavFromPath } from "../AjustesNavFromPath";
import type { AjustesVisibleSegments } from "@/lib/auth/ajustes-segments";

const PERSONAL = ["Perfil", "Apariencia", "Notificaciones", "Gmail, calendario y Cutto"];
const ORGANIZATION = [
  "General",
  "Tema y estilo",
  "Control de horario",
  "Tramos y fases",
  "Puestos",
  "Estatus",
  "Permisos",
  "Importar de monday",
  "Google",
];

const NONE: AjustesVisibleSegments = {
  general: false,
  tema: false,
  horario: false,
  tramos: false,
  puestos: false,
  estatus: false,
  permisos: false,
  monday: false,
  google: false,
};

function linkNames(): string[] {
  return screen.getAllByRole("link").map((link) => link.textContent?.replace(/Admin$/, "") ?? "");
}

afterEach(() => {
  cleanup();
  projectFlow.pages.tramos = true;
  projectFlow.pages.puestos = true;
});

describe("AjustesNav", () => {
  it("shows only the Personal group to a staff member without capabilities", () => {
    render(<AjustesNav active="apariencia" isAdmin={false} />);

    expect(linkNames()).toEqual(PERSONAL);
    expect(screen.queryByText("Organización")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
    for (const label of ["Permisos", "General", "Estatus"]) {
      expect(screen.queryByRole("link", { name: new RegExp(`^${label}`) })).toBeNull();
    }
  });

  it("omits every Organización item when the segments say so, even for isAdmin", () => {
    render(<AjustesNav active="perfil" isAdmin segments={NONE} />);
    expect(linkNames()).toEqual(PERSONAL);
  });

  it("shows every Organización item with an Admin badge to an administrator", () => {
    render(<AjustesNav active="permisos" isAdmin />);

    const group = screen.getByRole("list", { name: "Organización" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent?.replace(/Admin$/, ""))).toEqual(ORGANIZATION);
    for (const link of links) expect(within(link).getByText("Admin")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Personal" })).queryByText("Admin")).toBeNull();
  });

  it("renders exactly the segments the viewer can open (Dirección: General and Control de horario)", () => {
    render(<AjustesNav active="horario" isAdmin={false} segments={{ ...NONE, general: true, horario: true }} />);

    const group = screen.getByRole("list", { name: "Organización" });
    expect(within(group).getAllByRole("link").map((link) => link.textContent?.replace(/Admin$/, ""))).toEqual([
      "General",
      "Control de horario",
    ]);
  });

  it("links each item to its /ajustes segment and marks the active one", () => {
    render(<AjustesNav active="estatus" isAdmin />);

    const active = screen.getByRole("link", { name: /^Estatus/ });
    expect(active.getAttribute("href")).toBe("/ajustes/estatus");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Gmail, calendario y Cutto" }).getAttribute("href")).toBe(
      "/ajustes/integraciones",
    );
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("shows Tramos y fases and Puestos only when Project Flow's pages exist", () => {
    projectFlow.pages.tramos = false;
    projectFlow.pages.puestos = false;
    render(<AjustesNav active="general" isAdmin segments={{ ...NONE, general: true, tramos: true, puestos: true }} />);

    expect(screen.queryByRole("link", { name: /^Tramos y fases/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Puestos/ })).toBeNull();
    expect(screen.getByRole("link", { name: /^General/ })).toBeTruthy();
  });

  it("takes the active item from the path in the Ajustes layout", () => {
    nav.pathname = "/ajustes/google/primeros-pasos";
    render(<AjustesNavFromPath isAdmin />);
    expect(screen.getByRole("link", { name: /^Google/ }).getAttribute("aria-current")).toBe("page");
  });
});

describe("ajustesNavKeyFromPath", () => {
  it.each([
    ["/ajustes", "apariencia"],
    ["/ajustes/perfil", "perfil"],
    ["/ajustes/horario", "horario"],
    ["/ajustes/monday", "monday"],
    ["/ajustes/desconocido", "apariencia"],
    [null, "apariencia"],
  ])("%s → %s", (path, key) => {
    expect(ajustesNavKeyFromPath(path)).toBe(key);
  });
});
