// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { TeamCapabilities } from "@/lib/auth/permissions";
import type { GoogleAccessState } from "@/lib/equipo/google-access";
import type { AccessPreviewState, MemberDraft } from "@/lib/equipo/types";
import type { Area } from "@/lib/types/core";

const actions = vi.hoisted(() => ({ recheckStaffAccessAction: vi.fn() }));
vi.mock("@/lib/actions/workspace-access-actions", () => actions);

import { MemberEditorDrawer } from "./MemberEditorDrawer";

const STAFF_ID = "00000000-0000-4000-8000-000000000010";
const areas: Area[] = [
  { id: "a1", name: "Diseño", description: null, leadId: null, active: true, sortOrder: 0, colorSlot: 1 },
  { id: "a2", name: "Construcción", description: null, leadId: null, active: true, sortOrder: 1, colorSlot: 2 },
];
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
  hasSystemAccess: true,
  status: "Acceso activo",
  hasPasswordHash: false,
  authEnabled: true,
  mustChangePassword: false,
  passwordUpdatedAt: null,
  lastLoginAt: null,
};
const draft: MemberDraft = {
  name: "Ana",
  lastName: "López",
  access: "Arquitecto Senior",
  systemAccessEnabled: true,
  temporaryPassword: "",
  temporaryPasswordConfirmation: "",
  birthDate: "",
  nationality: "",
  phone: "",
  institutionalEmail: "ana@example.test",
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
  role: "Diseño",
  areaIds: ["a1"],
  capacity: 8,
  availability: "Disponible",
} as MemberDraft;

function renderDrawer(
  props: {
    googleManaged?: boolean;
    canRecheckAccess?: boolean;
    googleAccess?: GoogleAccessState | null;
    accessPreviewState?: AccessPreviewState;
  } = {},
) {
  return render(
    <MemberEditorDrawer
      show
      onClose={() => undefined}
      editingId={STAFF_ID}
      draft={draft}
      onChangeDraft={() => undefined}
      formError=""
      onSave={() => undefined}
      accessPreviewState={accessState}
      isEditingSelfProtectedAdmin={false}
      teamCapabilities={capabilities}
      availabilityOptions={["Disponible"]}
      areaOptions={areas}
      {...props}
    />,
  );
}

function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled") || element.hasAttribute("data-disabled") ||
    element.getAttribute("aria-disabled") === "true";
}

describe("MemberEditorDrawer — Google-managed staff", () => {
  beforeEach(() => actions.recheckStaffAccessAction.mockReset());
  afterEach(cleanup);

  it("shows role, access and áreas read-only with the Google Workspace badge", () => {
    renderDrawer({ googleManaged: true });
    expect(screen.getAllByText("Google Workspace")).toHaveLength(3);
    expect(isDisabled(screen.getByLabelText("Puesto"))).toBe(true);
    expect(isDisabled(screen.getByRole("combobox", { name: "Acceso" }))).toBe(true);
    expect(screen.queryByPlaceholderText("Buscar área...")).toBeNull();
    expect(screen.getByTestId("member-areas-readonly").textContent).toContain("Diseño");
    expect(screen.getByTestId("member-areas-readonly").textContent).not.toContain("Construcción");
  });

  it("keeps the other fields editable", () => {
    renderDrawer({ googleManaged: true });
    expect(isDisabled(screen.getByDisplayValue("Ana"))).toBe(false);
    expect(isDisabled(screen.getByDisplayValue("López"))).toBe(false);
  });

  it("leaves role, access and áreas editable for staff not managed by Google", () => {
    renderDrawer();
    expect(screen.queryByText("Google Workspace")).toBeNull();
    expect(isDisabled(screen.getByLabelText("Puesto"))).toBe(false);
    expect(isDisabled(screen.getByRole("combobox", { name: "Acceso" }))).toBe(false);
    expect(screen.getByPlaceholderText("Buscar área...")).toBeTruthy();
    expect(screen.queryByTestId("member-areas-readonly")).toBeNull();
  });

  it("shows Revisar acceso ahora only to an Administrador on a Google-managed member", () => {
    renderDrawer({ googleManaged: true, canRecheckAccess: false });
    expect(screen.queryByText("Revisar acceso ahora")).toBeNull();
    cleanup();
    renderDrawer({ googleManaged: false, canRecheckAccess: true });
    expect(screen.queryByText("Revisar acceso ahora")).toBeNull();
    cleanup();
    renderDrawer({ googleManaged: true, canRecheckAccess: true });
    expect(screen.getByText("Revisar acceso ahora")).toBeTruthy();
  });

  it("shows the re-check result inline", async () => {
    actions.recheckStaffAccessAction.mockResolvedValueOnce({ ok: true, allowed: true });
    renderDrawer({ googleManaged: true, canRecheckAccess: true });
    fireEvent.click(screen.getByText("Revisar acceso ahora"));
    await waitFor(() => expect(screen.getByText("Acceso confirmado")).toBeTruthy());
    expect(actions.recheckStaffAccessAction).toHaveBeenCalledWith(STAFF_ID);

    actions.recheckStaffAccessAction.mockResolvedValueOnce({ ok: true, allowed: false, reason: "workspace_suspended" });
    fireEvent.click(screen.getByText("Revisar acceso ahora"));
    await waitFor(() =>
      expect(screen.getByText("Acceso retirado: la cuenta está suspendida en Google Workspace")).toBeTruthy(),
    );

    actions.recheckStaffAccessAction.mockResolvedValueOnce({ ok: false, error: "directory_error" });
    fireEvent.click(screen.getByText("Revisar acceso ahora"));
    await waitFor(() => expect(screen.getByText("No pudimos consultar Google; intenta más tarde")).toBeTruthy());
  });
});

describe("MemberEditorDrawer — Acceso al sistema panel (#657)", () => {
  afterEach(cleanup);

  const googleActive: GoogleAccessState = {
    lastLoginAt: "2026-11-03T16:30:00.000Z",
    accessRevokedAt: null,
    accessRevokedReason: null,
  };
  // Password credential of a Google user is usually missing or disabled.
  const noPassword: AccessPreviewState = {
    ...accessState,
    hasSystemAccess: false,
    status: "Sin acceso al sistema",
    authEnabled: false,
  };

  it("shows Entra con Google for an active Google-linked member and hides the password controls", () => {
    renderDrawer({
      googleManaged: true,
      canRecheckAccess: true,
      googleAccess: googleActive,
      accessPreviewState: noPassword,
    });
    expect(screen.getByTestId("member-access-badge").textContent).toBe("Entra con Google");
    expect(screen.queryByText(/Sin acceso/)).toBeNull();
    expect(screen.queryByText("Tiene acceso al sistema")).toBeNull();
    expect(screen.queryByText(/no tendrá acceso al sistema/)).toBeNull();
    expect(screen.queryByText("Contraseña temporal")).toBeNull();
    expect(screen.queryByText("Último cambio de contraseña")).toBeNull();
    expect(screen.getByText("Último acceso")).toBeTruthy();
    expect(screen.queryByText("Sin registro")).toBeNull();
    expect(screen.getByText("Revisar acceso ahora")).toBeTruthy();
  });

  it("shows Sin acceso with the revoke reason for a revoked member", () => {
    renderDrawer({
      googleManaged: true,
      canRecheckAccess: true,
      googleAccess: {
        lastLoginAt: "2026-10-01T10:00:00.000Z",
        accessRevokedAt: "2026-11-01T10:00:00.000Z",
        accessRevokedReason: "workspace_suspended",
      },
      accessPreviewState: noPassword,
    });
    expect(screen.getByTestId("member-access-badge").textContent).toBe("Sin acceso");
    expect(screen.getByText(/la cuenta está suspendida en Google Workspace/)).toBeTruthy();
    expect(screen.queryByText("Entra con Google")).toBeNull();
    expect(screen.queryByText("Contraseña temporal")).toBeNull();
  });

  it("keeps the password controls for password-only members, with one badge", () => {
    renderDrawer({ accessPreviewState: { ...accessState, hasPasswordHash: true } });
    expect(screen.getByTestId("member-access-badge").children).toHaveLength(1);
    expect(screen.getByTestId("member-access-badge").textContent).toBe("Acceso activo");
    expect(screen.getByText("Tiene acceso al sistema")).toBeTruthy();
    expect(screen.getByText("Contraseña temporal")).toBeTruthy();
    expect(screen.getByText("Último cambio de contraseña")).toBeTruthy();
    expect(screen.queryByText("Entra con Google")).toBeNull();
  });

  it("renders a single Sin acceso al sistema badge for a password-only member without access", () => {
    renderDrawer({ accessPreviewState: noPassword });
    expect(screen.getAllByText("Sin acceso al sistema")).toHaveLength(1);
  });
});
