// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/lib/actions/staff-actions", () => ({
  fetchStaffAction: vi.fn(async () => [{ id: "s1", name: "Ana López", active: true }]),
}));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactsAction: vi.fn(async () => [{ id: "c1", name: "Familia Gómez", kind: "particular" }]),
}));
vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchWorkflowsAction: vi.fn(async () => [{ id: "w1", name: "Presale" }]),
}));
vi.mock("@/lib/actions/workspace-access-actions", () => ({ recheckStaffAccessAction: vi.fn() }));

import { ContactEditorSheet, emptyContactDraft } from "@/components/directorio/ContactEditorSheet";
import { MemberEditorDrawer } from "@/components/equipo/MemberEditorDrawer";
import { NewProjectDialog } from "@/components/proyectos/NewProjectDialog";
import type { TeamCapabilities } from "@/lib/auth/permissions";
import type { AccessPreviewState, MemberDraft } from "@/lib/equipo/types";

/** Only the rules this check is about: every form control and every button must have a name. */
async function nameViolations() {
  const results = await axe.run(document.body, {
    runOnly: { type: "rule", values: ["label", "button-name", "select-name", "aria-input-field-name", "aria-toggle-field-name"] },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("form fields have accessible names", () => {
  it("Directorio: Nuevo contacto", async () => {
    render(
      <ContactEditorSheet
        show
        onClose={() => undefined}
        editingId={null}
        draft={{
          ...emptyContactDraft,
          type: "proveedor",
          providerSubtype: "colaborador",
          people: [{ name: "", role: "", phone: "", email: "", isPrimary: true }],
        }}
        onChangeDraft={() => undefined}
        formError=""
        onSave={() => undefined}
      />,
    );
    for (const name of ["Nombre", "Teléfono", "Email", "Ubicación", "Canal de adquisición", "Notas", "Comentarios"]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    expect(screen.getByRole("combobox", { name: "Tipo de contacto" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Staff vinculado" })).toBeTruthy();
    expect(screen.getByLabelText("Nombre de la persona de contacto")).toBeTruthy();
    expect(await nameViolations()).toEqual([]);
  });

  it("Equipo: editor de colaborador", async () => {
    const capabilities: TeamCapabilities = {
      canViewTeam: true,
      canCreateCollaborator: true,
      canEditCollaborator: true,
      canChangeCollaboratorAccess: true,
      canToggleCollaboratorActive: true,
      canDeleteCollaborator: true,
      canExportData: true,
    };
    const accessState: AccessPreviewState = {
      hasSystemAccess: false,
      status: "Sin acceso",
      hasPasswordHash: false,
      authEnabled: false,
      mustChangePassword: false,
      passwordUpdatedAt: null,
      lastLoginAt: null,
    };
    const draft = {
      name: "",
      lastName: "",
      access: "Arquitecto Senior",
      systemAccessEnabled: true,
      temporaryPassword: "",
      temporaryPasswordConfirmation: "",
      birthDate: "",
      nationality: "",
      phone: "",
      institutionalEmail: "",
      address: "",
      maritalStatus: "",
      homePhone: "",
      personalEmail: "",
      curp: "",
      rfc: "",
      emergencyContactName: "",
      emergencyContactRelation: "",
      emergencyContactPhone: "",
      emergencyContactAddress: "",
      role: "",
      positionIds: [],
      capacity: 8,
      availability: "Disponible",
    } as unknown as MemberDraft;
    render(
      <MemberEditorDrawer
        show
        onClose={() => undefined}
        editingId={null}
        draft={draft}
        onChangeDraft={() => undefined}
        formError=""
        onSave={() => undefined}
        accessPreviewState={accessState}
        isEditingSelfProtectedAdmin={false}
        teamCapabilities={capabilities}
        availabilityOptions={["Disponible"]}
        positionOptions={[]}
      />,
    );
    for (const name of ["Apellidos", "Capacidad", "CURP", "RFC", "Celular", "Correo institucional"]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    expect(screen.getByRole("combobox", { name: "Disponibilidad" })).toBeTruthy();
    expect(await nameViolations()).toEqual([]);
  });

  it("Proyectos: Nuevo proyecto", async () => {
    render(<NewProjectDialog open onOpenChange={() => undefined} onConfirm={async () => undefined} presaleAutoStart />);
    await waitFor(() => expect(screen.getByLabelText("Nombre del proyecto").tagName).toBe("INPUT"));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(await nameViolations()).toEqual([]);
  });
});
