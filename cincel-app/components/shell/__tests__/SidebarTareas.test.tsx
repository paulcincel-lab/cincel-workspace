// @vitest-environment happy-dom
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/inicio", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { SidebarMenu } from "@/components/ui/shadcn/sidebar";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { useShellUi } from "@/lib/stores/shell-ui-store";
import type { ShellProject } from "@/lib/types/shell";

import { SidebarTareasEntry } from "../SidebarProjects";
import { navItem, WithSidebarProvider } from "./shell-fixtures";

let client: QueryClient;

const project = (id: string, name: string, status: ShellProject["status"] = "activo"): ShellProject => ({
  id,
  name,
  status,
  colorVar: "var(--chart-1)",
});

function renderEntry(projects: ShellProject[], badge = 13) {
  client.setQueryData(qk.shell.projects(), projects);
  render(
    <QueryClientProvider client={client}>
      <WithSidebarProvider>
        <SidebarMenu>
          <SidebarTareasEntry item={navItem("tareas", badge)} active={state.pathname === "/tareas"} />
        </SidebarMenu>
      </WithSidebarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = createTestQueryClient();
  useShellUi.setState({ tareasOpen: false });
});

afterEach(() => {
  cleanup();
  state.pathname = "/inicio";
  state.search = "";
});

describe("SidebarTareasEntry", () => {
  it("keeps the label linking to /tareas with its pending badge, and starts collapsed", () => {
    renderEntry([project("p1", "Casa Lomas")]);
    expect(screen.getByRole("link", { name: /Tareas/ }).getAttribute("href")).toBe("/tareas");
    expect(screen.getByText("13")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "Mostrar tareas por proyecto" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Casa Lomas" })).toBeNull();
  });

  it("toggles with the chevron, wiring aria-controls and the persisted open state", () => {
    renderEntry([project("p1", "Casa Lomas")]);
    const toggle = screen.getByRole("button", { name: "Mostrar tareas por proyecto" });
    fireEvent.click(toggle);
    expect(useShellUi.getState().tareasOpen).toBe(true);
    const open = screen.getByRole("button", { name: "Ocultar tareas por proyecto" });
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(open.getAttribute("aria-controls")!)?.hasAttribute("hidden")).toBe(false);
  });

  it("lists only active projects by name, each linking to /tareas?proyecto=<id>", () => {
    useShellUi.setState({ tareasOpen: true });
    renderEntry([
      project("p2", "Villa Sur"),
      project("p1", "Casa Lomas"),
      project("p3", "Torre Norte", "pausado"),
      project("p4", "Loft Centro", "completado"),
    ]);
    const list = screen.getByRole("list", { name: "Tareas por proyecto" });
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Casa Lomas", "Villa Sur"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/tareas?proyecto=p1", "/tareas?proyecto=p2"]);
    expect(screen.queryByText(/Pausados y cerrados/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Torre Norte" })).toBeNull();
  });

  it("highlights the entry whose id matches ?proyecto= and not the label", () => {
    useShellUi.setState({ tareasOpen: true });
    state.pathname = "/tareas";
    state.search = "proyecto=p2&estilo=visual";
    renderEntry([project("p1", "Casa Lomas"), project("p2", "Villa Sur")]);
    expect(screen.getByRole("link", { name: "Villa Sur" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Casa Lomas" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: /Tareas/ }).closest("li")!.querySelector("[data-active=true]")).toBeNull();
  });

  it("shows the filter input above 12 active projects and narrows the list", () => {
    useShellUi.setState({ tareasOpen: true });
    renderEntry(Array.from({ length: 13 }, (_, i) => project(`p${i}`, `Proyecto ${String.fromCharCode(65 + i)}`)));
    const input = screen.getByRole("searchbox", { name: "Filtrar proyectos" });
    fireEvent.change(input, { target: { value: "proyecto c" } });
    expect(screen.getAllByRole("link", { name: /^Proyecto/ })).toHaveLength(1);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("Ningún proyecto coincide.")).toBeTruthy();
  });

  it("has no filter input with 12 or fewer active projects", () => {
    useShellUi.setState({ tareasOpen: true });
    renderEntry([project("p1", "Casa Lomas")]);
    expect(screen.queryByRole("searchbox", { name: "Filtrar proyectos" })).toBeNull();
  });
});
