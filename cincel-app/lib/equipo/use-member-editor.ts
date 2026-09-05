"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  getCollaboratorAccessState,
  normalizeEmail,
  type AuthenticatedUser,
} from "@/lib/auth/auth-service";
import { resolveTeamCapabilities, type TeamCapabilities } from "@/lib/auth/permissions";
import type { TeamMember } from "@/lib/data/team";
import {
  DEFAULT_SYSTEM_ACCESS_ROLE,
  SYSTEM_ADMIN_ROLE,
  hasDefaultSystemAdministratorAccess,
  isAdministratorRole,
  normalizeSystemAccessRole,
  type SystemAccessRole,
} from "@/lib/data/roles";
import { readStorage, removeStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { fetchTeamMembers, saveTeamMembers, setTeamMemberCredential } from "@/lib/repositories/team-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import type { AccessPreviewState, MemberDraft } from "@/lib/equipo/types";

/**
 * Collaborator create/edit — draft state, validation, and credential
 * assignment (temporary password + system access toggle) — used by
 * app/equipo/EquipoClient.tsx. The actual privileged write
 * (setTeamMemberCredentialAction) re-checks capabilities and re-fetches the
 * member server-side regardless of what a caller sends — this hook is UI
 * state/validation/gating only, not the security boundary.
 */

export const SYSTEM_ROLE_STORAGE_KEY = "cincel.team.system-roles.v1";

export const emptyMemberDraft: MemberDraft = {
  name: "",
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
  role: "",
  area: "",
  capacity: 8,
  availability: "Disponible",
};

export function getSystemRole(member: TeamMember): SystemAccessRole {
  if (isAdministratorRole(member.role) || hasDefaultSystemAdministratorAccess(member.institutionalEmail)) {
    return SYSTEM_ADMIN_ROLE;
  }
  return DEFAULT_SYSTEM_ACCESS_ROLE;
}

function loadSystemRolesMap(): Record<number, SystemAccessRole> {
  if (typeof window === "undefined") return {};
  const stored = readStorage(SYSTEM_ROLE_STORAGE_KEY);
  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored) as Record<number, string>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.entries(parsed).reduce<Record<number, SystemAccessRole>>((accumulator, [memberId, role]) => {
      const normalized = normalizeSystemAccessRole(role);
      if (normalized) accumulator[Number(memberId)] = normalized;
      return accumulator;
    }, {});
  } catch {
    removeStorage(SYSTEM_ROLE_STORAGE_KEY);
    return {};
  }
}

interface UseMemberEditorArgs {
  members: TeamMember[];
  setMembers: Dispatch<SetStateAction<TeamMember[]>>;
  authenticatedUser: AuthenticatedUser | null;
  /** Applied to members refetched after a credential change (e.g. null→"" field normalization). */
  normalizeMember?: (member: TeamMember) => TeamMember;
}

export function useMemberEditor({
  members,
  setMembers,
  authenticatedUser,
  normalizeMember = (m) => m,
}: UseMemberEditorArgs) {
  const [systemRoleByMemberId, setSystemRoleByMemberId] = useState<Record<number, SystemAccessRole>>(
    () => loadSystemRolesMap()
  );
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MemberDraft>(emptyMemberDraft);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    writeStorage(SYSTEM_ROLE_STORAGE_KEY, JSON.stringify(systemRoleByMemberId));
  }, [systemRoleByMemberId]);

  const teamCapabilities: TeamCapabilities = useMemo(
    () => resolveTeamCapabilities(authenticatedUser),
    [authenticatedUser]
  );

  const resolveSystemRole = (member: TeamMember): SystemAccessRole => {
    const configured = systemRoleByMemberId[member.id];
    if (configured) return configured;
    return getSystemRole(member);
  };

  const isPrimaryAdminMember = (member: TeamMember): boolean =>
    hasDefaultSystemAdministratorAccess(member.institutionalEmail);

  const isSelfProtectedAdmin = (member: TeamMember): boolean => {
    if (!authenticatedUser) return false;
    return authenticatedUser.member.id === member.id && isPrimaryAdminMember(member);
  };

  const editorMember = editingId === null ? null : members.find((m) => m.id === editingId) ?? null;
  const isEditingSelfProtectedAdmin = Boolean(
    editorMember &&
      authenticatedUser &&
      authenticatedUser.member.id === editorMember.id &&
      hasDefaultSystemAdministratorAccess(editorMember.institutionalEmail)
  );
  const editorAccessState = editorMember ? getCollaboratorAccessState(editorMember) : null;

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

    if (editorAccessState) {
      const isTempPasswordBeingEdited = Boolean(
        draft.temporaryPassword.trim() || draft.temporaryPasswordConfirmation.trim()
      );
      if (!isTempPasswordBeingEdited) return editorAccessState;
      return {
        ...editorAccessState,
        hasSystemAccess: true,
        status: "Pendiente de primer acceso",
        hasPasswordHash: true,
        authEnabled: true,
        mustChangePassword: true,
        passwordUpdatedAt: null,
      };
    }

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
    setDraft(emptyMemberDraft);
    setFormError("");
    setShowEditor(true);
  };

  const openEditEditor = (member: TeamMember) => {
    if (!teamCapabilities.canEditCollaborator) return;

    const resolvedAccess = normalizeSystemAccessRole(resolveSystemRole(member)) ?? DEFAULT_SYSTEM_ACCESS_ROLE;
    const accessState = getCollaboratorAccessState(member);

    setEditingId(member.id);
    setDraft({
      name: member.name,
      access: resolvedAccess,
      systemAccessEnabled: accessState.hasSystemAccess,
      temporaryPassword: "",
      temporaryPasswordConfirmation: "",
      birthDate: member.birthDate,
      nationality: member.nationality,
      phone: member.phone,
      institutionalEmail: member.institutionalEmail,
      address: member.address,
      maritalStatus: member.maritalStatus,
      homePhone: member.homePhone,
      personalEmail: member.personalEmail,
      curp: member.curp,
      rfc: member.rfc,
      emergencyContactName: member.emergencyContact.name,
      emergencyContactRelation: member.emergencyContact.relation,
      emergencyContactPhone: member.emergencyContact.phone,
      emergencyContactAddress: member.emergencyContact.address,
      role: member.role,
      area: member.area,
      capacity: member.capacity,
      availability: member.availability,
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
    const birthDate = draft.birthDate.trim();
    const nationality = draft.nationality.trim();
    const phone = draft.phone.trim();
    const institutionalEmail = draft.institutionalEmail.trim();
    const address = draft.address.trim();
    const maritalStatus = draft.maritalStatus.trim();
    const homePhone = draft.homePhone.trim();
    const personalEmail = draft.personalEmail.trim();
    const curp = draft.curp.trim();
    const rfc = draft.rfc.trim();
    const emergencyContactName = draft.emergencyContactName.trim();
    const emergencyContactRelation = draft.emergencyContactRelation.trim();
    const emergencyContactPhone = draft.emergencyContactPhone.trim();
    const emergencyContactAddress = draft.emergencyContactAddress.trim();
    const role = draft.role.trim();
    const area = draft.area.trim();
    const access = draft.access;
    const normalizedInstitutionalEmail = normalizeEmail(institutionalEmail);
    const tempPassword = draft.temporaryPassword.trim();
    const tempPasswordConfirmation = draft.temporaryPasswordConfirmation.trim();
    const existingMember = editingId === null ? null : members.find((member) => member.id === editingId) ?? null;
    const existingAccessState = existingMember ? getCollaboratorAccessState(existingMember) : null;
    const shouldAssignTemporaryPassword =
      draft.systemAccessEnabled &&
      (editingId === null ||
        !existingAccessState?.hasPasswordHash ||
        Boolean(tempPassword) ||
        Boolean(tempPasswordConfirmation));
    const accessEnabledChanged = existingAccessState
      ? existingAccessState.hasSystemAccess !== draft.systemAccessEnabled
      : draft.systemAccessEnabled;

    if (!name || !role || !area || draft.capacity < 1) {
      setFormError("Completa nombre, puesto, area y una capacidad valida.");
      return;
    }

    if (institutionalEmail && !institutionalEmail.includes("@")) {
      setFormError("El correo institucional no es valido.");
      return;
    }

    if (!institutionalEmail) {
      setFormError("El correo institucional es obligatorio para acceso al sistema.");
      return;
    }

    if (draft.systemAccessEnabled && shouldAssignTemporaryPassword) {
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

    const normalized = name.toLowerCase();
    const duplicated = members.some(
      (member) => member.name.toLowerCase() === normalized && member.id !== editingId
    );
    if (duplicated) {
      setFormError("Ya existe un colaborador con ese nombre.");
      return;
    }

    const duplicatedEmail = members.some(
      (member) =>
        normalizeEmail(member.institutionalEmail || "") === normalizedInstitutionalEmail && member.id !== editingId
    );
    if (duplicatedEmail) {
      setFormError("El correo institucional ya esta en uso por otro colaborador.");
      return;
    }

    if (existingMember && isSelfProtectedAdmin(existingMember)) {
      const currentEmail = normalizeEmail(existingMember.institutionalEmail || "");
      if (normalizedInstitutionalEmail !== currentEmail) {
        setFormError("Tu correo administrador principal esta protegido y no puede modificarse.");
        return;
      }
    }

    const persistCredentialChange = async (memberId: number, memberRow: TeamMember) => {
      try {
        await saveTeamMembers([memberRow]);
        await setTeamMemberCredential(memberId, {
          enableAccess: draft.systemAccessEnabled,
          temporaryPassword: shouldAssignTemporaryPassword ? tempPassword : undefined,
        });
        const refreshed = await fetchTeamMembers();
        if (refreshed.length > 0) {
          setMembers(refreshed.map((m) => normalizeMember(m)));
        }
      } catch (err) {
        if (err instanceof RepositoryError) reportRepositoryError(err);
      }
    };

    if (editingId === null) {
      const nextId = members.reduce((max, member) => Math.max(max, member.id), 0) + 1;
      const newMember: TeamMember = {
        id: nextId,
        name,
        birthDate,
        nationality,
        phone,
        institutionalEmail: normalizedInstitutionalEmail,
        address,
        maritalStatus,
        homePhone,
        personalEmail,
        curp,
        rfc,
        emergencyContact: {
          name: emergencyContactName,
          relation: emergencyContactRelation,
          phone: emergencyContactPhone,
          address: emergencyContactAddress,
        },
        role,
        area,
        capacity: draft.capacity,
        availability: draft.availability,
        active: true,
      };

      setMembers((current) => [...current, newMember]);
      if (teamCapabilities.canChangeCollaboratorAccess) {
        setSystemRoleByMemberId((current) => ({ ...current, [nextId]: access }));
      }
      if (teamCapabilities.canChangeCollaboratorAccess && draft.systemAccessEnabled) {
        void persistCredentialChange(nextId, newMember);
      }
    } else {
      const updatedMember: TeamMember = {
        ...(existingMember as TeamMember),
        name,
        birthDate,
        nationality,
        phone,
        institutionalEmail: normalizedInstitutionalEmail,
        address,
        maritalStatus,
        homePhone,
        personalEmail,
        curp,
        rfc,
        emergencyContact: {
          name: emergencyContactName,
          relation: emergencyContactRelation,
          phone: emergencyContactPhone,
          address: emergencyContactAddress,
        },
        role,
        area,
        capacity: draft.capacity,
        availability: draft.availability,
      };

      setMembers((current) => current.map((member) => (member.id === editingId ? updatedMember : member)));

      if (teamCapabilities.canChangeCollaboratorAccess) {
        setSystemRoleByMemberId((current) => ({ ...current, [editingId]: access }));
      }
      if (teamCapabilities.canChangeCollaboratorAccess && (accessEnabledChanged || shouldAssignTemporaryPassword)) {
        void persistCredentialChange(editingId, updatedMember);
      }
    }

    setFormError("");
    setShowEditor(false);
  };

  return {
    teamCapabilities,
    systemRoleByMemberId,
    setSystemRoleByMemberId,
    resolveSystemRole,
    isPrimaryAdminMember,
    isSelfProtectedAdmin,
    showEditor,
    editingId,
    setEditingId,
    draft,
    setDraft,
    formError,
    isEditingSelfProtectedAdmin,
    accessPreviewState,
    openAddEditor,
    openEditEditor,
    closeEditor,
    saveMember,
  };
}
