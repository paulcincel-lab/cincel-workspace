// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { PortalProjectDTO } from "@/lib/types/portal";

const requirePortalUser = vi.hoisted(() => vi.fn());
const listPortalProjects = vi.hoisted(() => vi.fn());

vi.mock("@/lib/portal/session", () => ({ requirePortalUser, requirePortalViewer: vi.fn() }));
vi.mock("@/lib/portal/queries", () => ({ listPortalProjects }));

import PortalHomePage from "./page";

const project = (id: string, name: string): PortalProjectDTO => ({
  id,
  name,
  code: null,
  address: null,
  status: "en_progreso",
  progressPct: 10,
  startDate: null,
  endDate: null,
  manager: null,
});

describe("/portal", () => {
  beforeEach(() => {
    requirePortalUser.mockReset().mockResolvedValue({ id: "u1", name: "Ana", email: "ana@example.com", contactId: "c1" });
    listPortalProjects.mockReset();
  });
  afterEach(cleanup);

  it("lists one card per project of the signed-in client", async () => {
    listPortalProjects.mockResolvedValue([project("p1", "Casa Lomas"), project("p2", "Depa Roma")]);

    const { client } = renderWithQueryClient(await PortalHomePage());

    expect(listPortalProjects).toHaveBeenCalledWith("u1");
    expect(listPortalProjects).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(qk.portal.projects())).toEqual({
      projects: [project("p1", "Casa Lomas"), project("p2", "Depa Roma")],
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Casa Lomas" }).getAttribute("href")).toBe("/portal/proyectos/p1");
    expect(screen.getByRole("link", { name: "Depa Roma" }).getAttribute("href")).toBe("/portal/proyectos/p2");
    expect(screen.queryByText(/No tienes proyectos activos/)).toBeNull();
  });

  it("shows the empty state without projects", async () => {
    listPortalProjects.mockResolvedValue([]);

    renderWithQueryClient(await PortalHomePage());

    expect(
      screen.getByText("No tienes proyectos activos. Si crees que es un error, contacta a tu equipo de Cincel."),
    ).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("lets the requirePortalUser redirect through", async () => {
    requirePortalUser.mockRejectedValue(new Error("NEXT_REDIRECT /portal/login"));

    await expect(PortalHomePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(listPortalProjects).not.toHaveBeenCalled();
  });
});
