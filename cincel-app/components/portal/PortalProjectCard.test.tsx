// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { PortalProjectDTO } from "@/lib/types/portal";

import PortalProjectCard, { portalProjectHref } from "./PortalProjectCard";

afterEach(cleanup);

const project: PortalProjectDTO = {
  id: "p-1",
  name: "Casa Lomas",
  code: "CL-024",
  address: "Av. Reforma 10, CDMX",
  status: "en_progreso",
  progressPct: 42,
  startDate: "2026-01-10",
  endDate: "2026-12-15",
  manager: { name: "Laura Pérez", email: "laura@cincel.mx" },
};

describe("PortalProjectCard", () => {
  it("shows the name, code, progress, end date and manager with a mailto link", () => {
    render(<PortalProjectCard project={project} />);

    expect(screen.getByRole("link", { name: "Casa Lomas" }).getAttribute("href")).toBe("/portal/proyectos/p-1");
    expect(screen.getByText("CL-024")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
    expect(screen.getByText("15-12-2026")).toBeTruthy();
    expect(screen.getByText("Laura Pérez")).toBeTruthy();
    expect(screen.getByRole("link", { name: "laura@cincel.mx" }).getAttribute("href")).toBe("mailto:laura@cincel.mx");
    expect(screen.getByRole("link", { name: "Ver proyecto Casa Lomas" }).getAttribute("href")).toBe(
      "/portal/proyectos/p-1",
    );
  });

  it("covers a project without code, end date or manager", () => {
    render(<PortalProjectCard project={{ ...project, code: null, endDate: null, manager: null }} />);

    expect(screen.queryByText("CL-024")).toBeNull();
    expect(screen.getByText("Sin fecha")).toBeTruthy();
    expect(screen.getByText("Sin asignar")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /@/ })).toBeNull();
  });

  it("shows the manager name without a mailto link when there is no email", () => {
    render(<PortalProjectCard project={{ ...project, manager: { name: "Laura Pérez", email: null } }} />);

    expect(screen.getByText("Laura Pérez")).toBeTruthy();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("clamps the progress to 0-100", () => {
    render(<PortalProjectCard project={{ ...project, progressPct: 130 }} />);
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("encodes the project id in the link", () => {
    expect(portalProjectHref("a b")).toBe("/portal/proyectos/a%20b");
  });
});
