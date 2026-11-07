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

import { AreaEditorDrawer, type AreaDraft } from "@/components/configuracion/AreaEditorDrawer";
import { ContactEditorSheet, emptyContactDraft } from "@/components/directorio/ContactEditorSheet";
import { MemberEditorDrawer } from "@/components/equipo/MemberEditorDrawer";
import { ProjectCreateModal } from "@/components/proyectos/ProjectCreateModal";
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

  it("Áreas: Nueva área", async () => {
    const draft: AreaDraft = { name: "", description: "", leadId: null, active: true };
    render(
      <AreaEditorDrawer
        show
        onClose={() => undefined}
        editingArea={null}
        draft={draft}
        onChangeDraft={() => undefined}
        formError=""
        onSaveBasic={() => undefined}
        isSaving={false}
        staffOptions={[{ id: "s1", name: "Ana López" }]}
        workflowOptions={[]}
        memberNames={[]}
        onChangeMemberNames={() => undefined}
        onSaveMembers={() => undefined}
        workflowNames={[]}
        onChangeWorkflowNames={() => undefined}
        onSaveWorkflows={() => undefined}
        capabilities={{ canViewPositions: true, canManagePositions: true }}
      />,
    );
    expect(screen.getByLabelText("Nombre").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Descripción").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("combobox", { name: "Responsable" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Color" })).toBeTruthy();
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
      areaIds: [],
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
        areaOptions={[]}
      />,
    );
    for (const name of ["Apellidos", "Puesto", "Capacidad", "CURP", "RFC", "Celular", "Correo institucional"]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    expect(screen.getByRole("combobox", { name: "Disponibilidad" })).toBeTruthy();
    expect(await nameViolations()).toEqual([]);
  });

  it("Proyectos: Nuevo proyecto", async () => {
    render(<ProjectCreateModal onClose={() => undefined} onConfirm={async () => undefined} presaleAutoStart />);
    await waitFor(() => expect(screen.getByLabelText("Nombre del proyecto").tagName).toBe("INPUT"));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(await nameViolations()).toEqual([]);
  });
});
