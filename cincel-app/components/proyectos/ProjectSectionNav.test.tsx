// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ pathname: "/proyectos/p1/ficha" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
// Custom permission overrides live in localStorage; stub it so the tests use the default matrix.
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));

import type { SessionAccess } from "@/lib/auth/session";
import { useSessionStore } from "@/lib/stores/session-store";

import { activeProjectSection, ProjectSectionNav, projectSectionLinks } from "./ProjectSectionNav";

function signIn(access: "Administrador" | "Colaborador") {
  const user = { id: "s1", name: "Ana", email: "ana@example.test", role: access, area: null, active: true, access };
  useSessionStore.setState({ access: { status: "active", user } as unknown as SessionAccess });
}

// Base UI gives each tab role="tab", so look the anchors up by their label.
function tab(label: string): HTMLAnchorElement {
  const el = screen.getByText(label).closest("a");
  if (!el) throw new Error(`no link for ${label}`);
  return el;
}

afterEach(() => {
  cleanup();
  navigation.pathname = "/proyectos/p1/ficha";
  useSessionStore.setState({ access: { status: "guest", user: null } });
});

describe("projectSectionLinks", () => {
  it("adds Resumen and Tareas, puts Ficha last and carries the counts", () => {
    const links = projectSectionLinks("p1", { counts: { tareas: 39, archivos: 48, clientes: 2 } });
    expect(links.map((l) => l.section)).toEqual(["resumen", "tareas", "cronograma", "archivos", "ficha"]);
    expect(links[0].href).toBe("/proyectos/p1");
    expect(links.find((l) => l.section === "tareas")?.count).toBe(39);
    expect(links.find((l) => l.section === "archivos")?.count).toBe(48);
    expect(links.find((l) => l.section === "cronograma")?.count).toBeUndefined();
  });

  it("adds Clientes before Ficha only when asked", () => {
    const links = projectSectionLinks("p1", { showClientes: true });
    expect(links.map((l) => l.section)).toEqual(["resumen", "tareas", "cronograma", "archivos", "clientes", "ficha"]);
    expect(links.find((l) => l.section === "clientes")?.href).toBe("/proyectos/p1/clientes");
  });
});

describe("activeProjectSection", () => {
  it("reads the bare project URL as Resumen and /tareas as Tareas", () => {
    expect(activeProjectSection("/proyectos/p1")).toBe("resumen");
    expect(activeProjectSection("/proyectos/p1/")).toBe("resumen");
    expect(activeProjectSection("/proyectos/p1/tareas")).toBe("tareas");
  });

  it("reads the section from the path", () => {
    expect(activeProjectSection("/proyectos/p1/ficha")).toBe("ficha");
    expect(activeProjectSection("/proyectos/p1/archivos")).toBe("archivos");
  });

  it("keeps the parent tab on nested pages", () => {
    expect(activeProjectSection("/proyectos/p1/cronograma/reporte")).toBe("cronograma");
  });

  it("returns null outside a project section", () => {
    expect(activeProjectSection("/proyectos")).toBeNull();
    expect(activeProjectSection("/proyectos/p1/otra")).toBeNull();
    expect(activeProjectSection(null)).toBeNull();
  });
});

describe("ProjectSectionNav", () => {
  it("renders the three tabs as links and no Clientes tab", () => {
    render(<ProjectSectionNav projectId="p1" />);
    expect(tab("Ficha").getAttribute("href")).toBe("/proyectos/p1/ficha");
    expect(tab("Cronograma").getAttribute("href")).toBe("/proyectos/p1/cronograma");
    expect(tab("Archivos").getAttribute("href")).toBe("/proyectos/p1/archivos");
    expect(screen.queryByText("Clientes")).toBeNull();
  });

  it("marks the current section as active", () => {
    navigation.pathname = "/proyectos/p1/cronograma";
    render(<ProjectSectionNav projectId="p1" />);
    const active = tab("Cronograma");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.hasAttribute("data-active")).toBe(true);
    expect(tab("Ficha").getAttribute("aria-current")).toBeNull();
  });

  it("renders Clientes when showClientes is set", () => {
    render(<ProjectSectionNav projectId="p1" showClientes />);
    expect(tab("Clientes").getAttribute("href")).toBe("/proyectos/p1/clientes");
  });

  it("shows Clientes to staff with portal.manageAccess", () => {
    signIn("Administrador");
    render(<ProjectSectionNav projectId="p1" />);
    expect(tab("Clientes").getAttribute("href")).toBe("/proyectos/p1/clientes");
  });

  it("hides Clientes from staff without portal.manageAccess", () => {
    signIn("Colaborador");
    render(<ProjectSectionNav projectId="p1" />);
    expect(screen.queryByText("Clientes")).toBeNull();
  });

  it("lets showClientes={false} override the capability", () => {
    signIn("Administrador");
    render(<ProjectSectionNav projectId="p1" showClientes={false} />);
    expect(screen.queryByText("Clientes")).toBeNull();
  });
});
