import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ASSIGN_CLIENT_HINT, ProjectAdminFields, projectAdminPatch } from "./ProjectAdminFields";

afterEach(cleanup);

const clients = [{ id: "c1", name: "Familia Ruiz" }];
const staff = [{ id: "s1", name: "Ana López" }];
const empty = { clientId: null, origin: null, originStaffId: null };

describe("ProjectAdminFields", () => {
  it("renders Cliente, Origen and Quién trajo el proyecto with empty defaults", () => {
    render(<ProjectAdminFields value={empty} onChange={vi.fn()} clients={clients} staff={staff} projectHasClient={false} />);
    expect(screen.getByText("Cliente")).toBeTruthy();
    expect(screen.getByLabelText("Origen")).toBeTruthy();
    expect(screen.getByText("Quién trajo el proyecto")).toBeTruthy();
    expect(screen.getByText("Sin cliente")).toBeTruthy();
    expect(screen.getByText("Nadie del equipo")).toBeTruthy();
  });

  it("shows the admin-task hint only while the project has no client", () => {
    const { rerender } = render(
      <ProjectAdminFields value={empty} onChange={vi.fn()} clients={clients} staff={staff} projectHasClient={false} />,
    );
    expect(screen.getByText(ASSIGN_CLIENT_HINT)).toBeTruthy();
    rerender(
      <ProjectAdminFields
        value={{ ...empty, clientId: "c1" }}
        onChange={vi.fn()}
        clients={clients}
        staff={staff}
        projectHasClient
      />,
    );
    expect(screen.queryByText(ASSIGN_CLIENT_HINT)).toBeNull();
  });

  it("reports origin edits", () => {
    const onChange = vi.fn();
    render(<ProjectAdminFields value={empty} onChange={onChange} clients={clients} staff={staff} projectHasClient={false} />);
    fireEvent.change(screen.getByLabelText("Origen"), { target: { value: "Recomendación" } });
    expect(onChange).toHaveBeenCalledWith({ ...empty, origin: "Recomendación" });
  });
});

describe("projectAdminPatch", () => {
  it("trims the origin and saves a blank one as null", () => {
    expect(projectAdminPatch({ clientId: "c1", origin: "  Feria  ", originStaffId: "s1" })).toEqual({
      clientId: "c1",
      origin: "Feria",
      originStaffId: "s1",
    });
    expect(projectAdminPatch({ clientId: null, origin: "   ", originStaffId: null })).toEqual(empty);
  });
});
