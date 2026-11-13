// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const projectFlow = vi.hoisted(() => ({ pages: { tramos: true, puestos: true } }));
vi.mock("@/lib/auth/ajustes-segments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/ajustes-segments")>();
  return { ...actual, PROJECT_FLOW_SETTINGS_PAGES: projectFlow.pages };
});

const nav = vi.hoisted(() => ({ pathname: "/ajustes/apariencia", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }));

import { AjustesNav, ajustesNavKeyFromPath } from "../AjustesNav";
import { AjustesNavFromPath } from "../AjustesNavFromPath";
import type { AjustesVisibleSegments } from "@/lib/auth/ajustes-segments";

const PERSONAL = ["Perfil", "Apariencia", "Notificaciones", "Gmail, calendario y Cutto"];
const ORGANIZATION = [
  "General",
  "Tema y estilo",
  "Control de horario",
  "Etapas y fases",
  "Puestos",
  "Estatus",
  "Permisos",
  "Importar de monday",
  "Google",
  "Proyectos eliminados",
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
  eliminados: false,
};

function linkNames(): string[] {
  return screen.getAllByRole("link").map((link) => link.textContent ?? "");
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
    expect(screen.queryByText("Despacho · Admin")).toBeNull();
    for (const label of ["Permisos", "General", "Estatus"]) {
      expect(screen.queryByRole("link", { name: new RegExp(`^${label}`) })).toBeNull();
    }
  });

  it("omits every Organización item when the segments say so, even for isAdmin", () => {
    render(<AjustesNav active="perfil" isAdmin segments={NONE} />);
    expect(linkNames()).toEqual(PERSONAL);
  });

  it("shows every item of the Despacho · Admin group to an administrator", () => {
    render(<AjustesNav active="permisos" isAdmin />);

    const group = screen.getByRole("list", { name: "Despacho · Admin" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(ORGANIZATION);
    expect(within(screen.getByRole("list", { name: "Personal" })).getAllByRole("link")).toHaveLength(PERSONAL.length);
  });

  it("styles the group labels as mono uppercase captions", () => {
    render(<AjustesNav active="perfil" isAdmin />);
    for (const label of ["Personal", "Despacho · Admin"]) {
      const heading = screen.getByRole("heading", { name: label });
      expect(heading.className).toMatch(/font-mono/);
      expect(heading.className).toMatch(/uppercase/);
    }
  });

  it("offers the same sections as a Select \"Sección\" for narrow screens", () => {
    render(<AjustesNav active="notificaciones" isAdmin={false} />);
    const select = document.querySelector('[data-slot="ajustes-nav-select"]');
    expect(select).toBeTruthy();
    expect(select?.className).toMatch(/md:hidden/);
    expect(screen.getByLabelText("Sección")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Secciones de ajustes" }).className).toMatch(/hidden md:flex/);
  });

  it("renders exactly the segments the viewer can open (Dirección: General and Control de horario)", () => {
    render(<AjustesNav active="horario" isAdmin={false} segments={{ ...NONE, general: true, horario: true }} />);

    const group = screen.getByRole("list", { name: "Despacho · Admin" });
    expect(within(group).getAllByRole("link").map((link) => link.textContent)).toEqual([
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

  it("shows Etapas y fases and Puestos only when Project Flow's pages exist", () => {
    projectFlow.pages.tramos = false;
    projectFlow.pages.puestos = false;
    render(<AjustesNav active="general" isAdmin segments={{ ...NONE, general: true, tramos: true, puestos: true }} />);

    expect(screen.queryByRole("link", { name: /^Etapas y fases/ })).toBeNull();
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
