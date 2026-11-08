"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { normalizeEmail, type AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveTeamCapabilities, type TeamCapabilities } from "@/lib/auth/permissions";
import {
  DEFAULT_SYSTEM_ACCESS_ROLE,
  hasDefaultSystemAdministratorAccess,
  normalizeSystemAccessRole,
} from "@/lib/data/roles";
import { fetchStaffDetailAction, saveMemberAction } from "@/lib/actions/staff-actions";
import { actionErrorCode } from "@/lib/errors";
import type { GoogleAccessState } from "@/lib/equipo/google-access";
import type { MemberEditorInput } from "@/lib/equipo/member-input";
import type { AccessPreviewState, MemberDraft } from "@/lib/equipo/types";
import { qk } from "@/lib/query/keys";
import { mutationErrorText, useActionMutation } from "@/lib/query/mutation";
import type { Staff, StaffDetail } from "@/lib/types/core";
import { GOOGLE_MANAGED_ERROR } from "@/lib/types/workspace-access";

/**
 * Collaborator create/edit — draft state, validation, and credential
 * assignment (temporary password + system access toggle) — used by
 * Personas · Equipo (`components/personas/EquipoView.tsx`).
 *
 * `staff.role` holds the system access role only, edited through the
 * drawer's "Acceso" dropdown (`draft.access`). Job positions are puestos
 * (project flow RD-9).
 *
 * A save is **one** mutation (`saveMemberAction`, Query Migration 6): the
 * person, profile, puestos and access in one POST and one transaction, so a
 * failure saves nothing. The action re-checks every capability server-side
 * regardless of what a caller sends — this hook is UI state/validation/gating
 * only, not the security boundary.
 */

/** The form copy for a failed save: the Google refusal as is, otherwise the action error copy. */
export function memberSaveErrorText(err: unknown): string {
  if (err instanceof Error && err.message === GOOGLE_MANAGED_ERROR) return GOOGLE_MANAGED_ERROR;
  // No code (a stripped production error, a network failure): the editor's own copy.
  if (actionErrorCode(err) === "") return "No se pudo guardar el colaborador.";
  return mutationErrorText(err);
}

export const emptyMemberDraft: MemberDraft = {
  name: "",
  lastName: "",
  access: DEFAULT_SYSTEM_ACCESS_ROLE,
  systemAccessEnabled: false,
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
  positionIds: [],
  capacity: 8,
  availability: "Disponible",
};

interface UseMemberEditorArgs {
  authenticatedUser: AuthenticatedUser | null;
  /** Called after a successful save, once the editor closes. */
  onSaved?: (saved: StaffDetail) => void;
}

export function useMemberEditor({ authenticatedUser, onSaved }: UseMemberEditorArgs) {
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editorAccessState, setEditorAccessState] = useState<AccessPreviewState | null>(null);
  const [draft, setDraft] = useState<MemberDraft>(emptyMemberDraft);
  const [formError, setFormError] = useState("");

  const ownId = authenticatedUser?.member.id ?? null;
  const save = useActionMutation(saveMemberAction, {
    invalidate: (vars: MemberEditorInput, saved) => {
      const id = saved?.id ?? vars.staffId;
      return [
        qk.personas.equipo(),
        qk.personas.counts(),
        ...(id ? [qk.personas.detail(id)] : []),
        qk.catalog.staff(),
        // Every `catalog.assignableStaff(workflowId)` list.
        qk.catalog.assignableStaff(null).slice(0, 2),
        qk.ajustes.page("permisos"),
        ...(id && id === ownId ? [qk.me.profile()] : []),
      ];
    },
    // The error shows in the drawer (memberSaveErrorText), not as a toast.
    onFormError: () => undefined,
  });

  const teamCapabilities: TeamCapabilities = useMemo(
    () => resolveTeamCapabilities(authenticatedUser),
    [authenticatedUser]
  );

  const isPrimaryAdminMember = (member: Pick<Staff, "email">): boolean =>
    hasDefaultSystemAdministratorAccess(member.email);

  const isSelfProtectedAdmin = (member: Pick<Staff, "id" | "email">): boolean => {
    if (!authenticatedUser) return false;
    return authenticatedUser.member.id === member.id && isPrimaryAdminMember(member);
  };

  const isEditingSelfProtectedAdmin = Boolean(
    editingStaff && authenticatedUser && authenticatedUser.member.id === editingStaff.id &&
      hasDefaultSystemAdministratorAccess(editingStaff.email)
  );

  // Acceso and puestos of Google-managed staff come from Workspace (FE §2.6): the
  // drawer shows them read-only and a save leaves them out.
  const editingGoogleManaged = Boolean(editingId !== null && editingStaff?.googleManaged);
  // Google-linked staff sign in with Google, not a password (#657): the drawer
  // shows their Google access state and a save leaves the credential alone.
  const editingGoogleAccess: GoogleAccessState | null =
    editingGoogleManaged && editingStaff
      ? {
          lastLoginAt: editingStaff.lastLoginAt,
          accessRevokedAt: editingStaff.accessRevokedAt,
          accessRevokedReason: editingStaff.accessRevokedReason,
        }
      : null;

  const accessPreviewState = useMemo<AccessPreviewState>(() => {
    if (!draft.systemAccessEnabled) {
      return {
        hasSystemAccess: false,
        status: "Sin acceso al sistema",
        hasPasswordHash: false,
        authEnabled: false,
        mustChangePassword: false,
        passwordUpdatedAt: null,
        lastLoginAt: null,
      };
    }

    const isTempPasswordBeingEdited = Boolean(
      draft.temporaryPassword.trim() || draft.temporaryPasswordConfirmation.trim()
    );
    if (editorAccessState && !isTempPasswordBeingEdited) return editorAccessState;

    return {
      hasSystemAccess: true,
      status: draft.temporaryPassword.trim() ? "Pendiente de primer acceso" : "Sin contraseña temporal",
      hasPasswordHash: Boolean(draft.temporaryPassword.trim()),
      authEnabled: true,
      mustChangePassword: true,
      passwordUpdatedAt: null,
      lastLoginAt: null,
    };
  }, [draft.systemAccessEnabled, draft.temporaryPassword, draft.temporaryPasswordConfirmation, editorAccessState]);

  const openAddEditor = () => {
    if (!teamCapabilities.canCreateCollaborator) return;
    setEditingId(null);
    setEditingStaff(null);
    setEditorAccessState(null);
    setDraft(emptyMemberDraft);
    setFormError("");
    setShowEditor(true);
  };

  const openEditEditor = async (member: Staff) => {
    if (!teamCapabilities.canEditCollaborator) return;

    const detail = await fetchStaffDetailAction(member.id);
    if (!detail) return;
    const access = normalizeSystemAccessRole(detail.role) ?? DEFAULT_SYSTEM_ACCESS_ROLE;

    setEditingId(member.id);
    setEditingStaff(detail);
    setEditorAccessState(
      detail.access
        ? {
            hasSystemAccess: detail.access.enabled,
            status: detail.access.enabled
              ? detail.access.mustChangePassword
                ? "Pendiente de primer acceso"
                : "Acceso activo"
              : "Sin acceso al sistema",
            hasPasswordHash: detail.access.hasPassword,
            authEnabled: detail.access.enabled,
            mustChangePassword: detail.access.mustChangePassword,
            passwordUpdatedAt: detail.access.passwordUpdatedAt,
            lastLoginAt: detail.access.lastLoginAt,
          }
        : null
    );
    setDraft({
      name: detail.name,
      lastName: detail.lastName ?? "",
      access,
      systemAccessEnabled: detail.access?.enabled ?? false,
      temporaryPassword: "",
      temporaryPasswordConfirmation: "",
      birthDate: detail.profile?.birthDate ?? "",
      nationality: detail.profile?.nationality ?? "",
      phone: detail.phone ?? "",
      institutionalEmail: detail.email ?? "",
      address: detail.profile?.address ?? "",
      maritalStatus: detail.profile?.maritalStatus ?? "",
      homePhone: detail.profile?.homePhone ?? "",
      personalEmail: detail.profile?.personalEmail ?? "",
      curp: detail.profile?.curp ?? "",
      rfc: detail.profile?.rfc ?? "",
      emergencyContactName: detail.profile?.emergencyContactName ?? "",
      emergencyContactRelation: detail.profile?.emergencyContactRelation ?? "",
      emergencyContactPhone: detail.profile?.emergencyContactPhone ?? "",
      emergencyContactAddress: detail.profile?.emergencyContactAddress ?? "",
      positionIds: detail.positions?.map((p) => p.id) ?? [],
      capacity: detail.capacity,
      availability: detail.availability ?? "Disponible",
    });
    setFormError("");
    setShowEditor(true);
  };

  const closeEditor = () => {
    setFormError("");
    setShowEditor(false);
  };

  const saveMember = () => {
    if (editingId === null && !teamCapabilities.canCreateCollaborator) return;
    if (editingId !== null && !teamCapabilities.canEditCollaborator) return;

    const name = draft.name.trim();
    const lastName = draft.lastName.trim();
    const institutionalEmail = draft.institutionalEmail.trim();
    const normalizedEmail = normalizeEmail(institutionalEmail);
    const tempPassword = draft.temporaryPassword.trim();
    const tempPasswordConfirmation = draft.temporaryPasswordConfirmation.trim();

    if (!name || draft.capacity < 1) {
      setFormError("Completa nombre y una capacidad válida.");
      return;
    }
    if (editingId === null && !lastName) {
      setFormError("Los apellidos son obligatorios para un colaborador nuevo.");
      return;
    }
    if (!institutionalEmail || !institutionalEmail.includes("@")) {
      setFormError("El correo institucional es obligatorio y debe ser válido.");
      return;
    }

    const shouldAssignTemporaryPassword =
      !editingGoogleManaged &&
      draft.systemAccessEnabled &&
      (editingId === null || !accessPreviewState.hasPasswordHash || Boolean(tempPassword) || Boolean(tempPasswordConfirmation));

    if (shouldAssignTemporaryPassword) {
      if (!tempPassword) {
        setFormError("Asigna una contraseña temporal para habilitar el acceso al sistema.");
        return;
      }
      if (tempPassword !== tempPasswordConfirmation) {
        setFormError("La contraseña temporal y su confirmación no coinciden.");
        return;
      }
      if (tempPassword.length < 8) {
        setFormError("La contraseña temporal debe tener al menos 8 caracteres.");
        return;
      }
    }

    if (editingStaff && isSelfProtectedAdmin(editingStaff)) {
      if (normalizedEmail !== normalizeEmail(editingStaff.email ?? "")) {
        setFormError("Tu correo administrador principal está protegido y no puede modificarse.");
        return;
      }
    }

    setFormError("");
    const input: MemberEditorInput = {
      staffId: editingId,
      staff: {
        name,
        lastName: lastName || null,
        // staff.role is the access role — see module comment. Workspace sets it for Google-managed staff.
        ...(editingGoogleManaged ? {} : { role: draft.access }),
        email: normalizedEmail,
        phone: draft.phone.trim() || null,
        capacity: draft.capacity,
        availability: draft.availability,
      },
      profile: {
        birthDate: draft.birthDate.trim() || null,
        nationality: draft.nationality.trim() || null,
        address: draft.address.trim() || null,
        maritalStatus: draft.maritalStatus.trim() || null,
        homePhone: draft.homePhone.trim() || null,
        personalEmail: draft.personalEmail.trim() || null,
        curp: draft.curp.trim() || null,
        rfc: draft.rfc.trim() || null,
        emergencyContactName: draft.emergencyContactName.trim() || null,
        emergencyContactRelation: draft.emergencyContactRelation.trim() || null,
        emergencyContactPhone: draft.emergencyContactPhone.trim() || null,
        emergencyContactAddress: draft.emergencyContactAddress.trim() || null,
      },
      ...(editingGoogleManaged ? {} : { positionIds: draft.positionIds }),
      ...(teamCapabilities.canChangeCollaboratorAccess && !editingGoogleManaged
        ? {
            credential: {
              enableAccess: draft.systemAccessEnabled,
              ...(shouldAssignTemporaryPassword ? { temporaryPassword: tempPassword } : {}),
            },
          }
        : {}),
    };

    save.mutate(input, {
      onSuccess: (saved) => {
        setShowEditor(false);
        onSaved?.(saved);
      },
      onError: (err) => setFormError(memberSaveErrorText(err)),
    });
  };

  return {
    teamCapabilities,
    isPrimaryAdminMember,
    isSelfProtectedAdmin,
    showEditor,
    editingId,
    draft,
    setDraft: setDraft as Dispatch<SetStateAction<MemberDraft>>,
    formError,
    saving: save.isPending,
    isEditingSelfProtectedAdmin,
    editingGoogleManaged,
    editingGoogleAccess,
    accessPreviewState,
    openAddEditor,
    openEditEditor,
    closeEditor,
    saveMember,
  };
}
