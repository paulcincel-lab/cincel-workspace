"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ExportMenu from "@/components/ui/ExportMenu";
import { DataTable } from "@/components/ui/DataTable";
import { CoordinatorProjectsModal } from "@/components/equipo/CoordinatorProjectsModal";
import { MemberEditorDrawer } from "@/components/equipo/MemberEditorDrawer";
import { MemberProfileModal } from "@/components/equipo/MemberProfileModal";
import type { AccessPreviewState, MemberDraft, TeamMemberWithWorkload } from "@/lib/equipo/types";
import { getCollaboratorAccessState, getCurrentAuthenticatedUser, normalizeEmail } from "@/lib/auth/auth-service";
import { resolveTeamCapabilities } from "@/lib/auth/permissions";
import { type TeamAvailability, type TeamMember } from "@/lib/data/team";
import { DEFAULT_SYSTEM_ACCESS_ROLE, SYSTEM_ACCESS_ROLES, SYSTEM_ADMIN_ROLE, hasDefaultSystemAdministratorAccess, isAdministratorRole, normalizeSystemAccessRole, type SystemAccessRole } from "@/lib/data/roles";
import { loadGeneralSettings } from "@/lib/settings/general-settings";
import type { Task } from "@/lib/types/task";
import { exportTableData, type ExportColumn } from "@/lib/utils/export-service";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";
import { getTeamMembersSnapshot, fetchTeamMembers, saveTeamMembers, setTeamMemberCredential } from "@/lib/repositories/team-repository";
import { getProjectsSnapshot, fetchProjects } from "@/lib/repositories/projects-repository";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";


const emptyDraft: MemberDraft = {
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


const availabilityOptions: TeamAvailability[] = [
  "Disponible",
  "Medio Tiempo",
  "Mixto",
  "No disponible",
  "Vacaciones",
  "Permiso",
  "Capacitacion",
  "Home Office",
];

const SECONDARY_COORDINATOR_STORAGE_KEY = "cincel.projects.secondary-coordinator.v1";
const SYSTEM_ROLE_STORAGE_KEY = "cincel.team.system-roles.v1";
const ACTIVE_COLUMN_ORDER_STORAGE_KEY = "cincel.team.active-column-order.v1";
const INACTIVE_COLUMN_ORDER_STORAGE_KEY = "cincel.team.inactive-column-order.v1";

type ActiveColumnKey =
  | "order"
  | "colaborador"
  | "institutionalEmail"
  | "puesto"
  | "rol"
  | "area"
  | "estado"
  | "disponibilidad"
  | "liderDiseno"
  | "liderConstruccion"
  | "responsable"
  | "soporte"
  | "carga"
  | "proyectos"
  | "acciones";

type InactiveColumnKey =
  | "order"
  | "colaborador"
  | "institutionalEmail"
  | "puesto"
  | "rol"
  | "area"
  | "disponibilidad"
  | "liderDiseno"
  | "liderConstruccion"
  | "proyectos"
  | "acciones";

const ACTIVE_COLUMN_DEFAULT_ORDER: ActiveColumnKey[] = [
  "order",
  "colaborador",
  "institutionalEmail",
  "puesto",
  "rol",
  "area",
  "estado",
  "disponibilidad",
  "liderDiseno",
  "liderConstruccion",
  "responsable",
  "soporte",
  "carga",
  "proyectos",
  "acciones",
];

const INACTIVE_COLUMN_DEFAULT_ORDER: InactiveColumnKey[] = [
  "order",
  "colaborador",
  "institutionalEmail",
  "puesto",
  "rol",
  "area",
  "disponibilidad",
  "liderDiseno",
  "liderConstruccion",
  "proyectos",
  "acciones",
];

const ACTIVE_COLUMN_LABEL: Record<ActiveColumnKey, string> = {
  order: "Orden",
  colaborador: "Colaborador",
  institutionalEmail: "Correo institucional",
  puesto: "Puesto",
  rol: "Acceso",
  area: "Area",
  estado: "Estado",
  disponibilidad: "Disponibilidad",
  liderDiseno: "Lider de diseño",
  liderConstruccion: "Lider de construcción",
  responsable: "Responsable",
  soporte: "Soporte",
  carga: "Carga",
  proyectos: "Proyectos activos",
  acciones: "Acciones",
};

const INACTIVE_COLUMN_LABEL: Record<InactiveColumnKey, string> = {
  order: "Orden",
  colaborador: "Colaborador",
  institutionalEmail: "Correo institucional",
  puesto: "Puesto",
  rol: "Acceso",
  area: "Area",
  disponibilidad: "Disponibilidad",
  liderDiseno: "Lider de diseño",
  liderConstruccion: "Lider de construcción",
  proyectos: "Proyectos activos",
  acciones: "Acciones",
};

function loadColumnOrder<T extends string>(storageKey: string, defaults: T[]): T[] {
  if (typeof window === "undefined") {
    return defaults;
  }

  const stored = readStorage(storageKey);
  if (!stored) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(stored) as T[];
    if (!Array.isArray(parsed)) {
      return defaults;
    }

    const defaultsSet = new Set(defaults);
    const cleaned = parsed.filter((item): item is T => defaultsSet.has(item));
    const missing = defaults.filter((item) => !cleaned.includes(item));

    if (cleaned.length === 0) {
      return defaults;
    }

    return [...cleaned, ...missing];
  } catch {
    return defaults;
  }
}

function buildTimestampLabel(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `${date}-${time}`;
}

function loadSecondaryCoordinatorMap(): Record<number, string> {
  if (typeof window === "undefined") return {};
  const stored = readStorage(SECONDARY_COORDINATOR_STORAGE_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as Record<number, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTeamMember(raw: TeamMember): TeamMember {
  return {
    ...raw,
    birthDate: raw.birthDate ?? "",
    nationality: raw.nationality ?? "",
    phone: raw.phone ?? "",
    institutionalEmail: raw.institutionalEmail ?? "",
    address: raw.address ?? "",
    maritalStatus: raw.maritalStatus ?? "",
    homePhone: raw.homePhone ?? "",
    personalEmail: raw.personalEmail ?? "",
    curp: raw.curp ?? "",
    rfc: raw.rfc ?? "",
    emergencyContact: {
      name: raw.emergencyContact?.name ?? "",
      relation: raw.emergencyContact?.relation ?? "",
      phone: raw.emergencyContact?.phone ?? "",
      address: raw.emergencyContact?.address ?? "",
    },
  };
}

function loadPersistedTasks(workflow: string, fallback: Task[]): Task[] {
  if (workflow === "Presale" || workflow === "Diseño" || workflow === "Construcción") {
    return loadLinkedTasks(workflow, fallback);
  }

  return fallback;
}

function loadPersistedProjects() {
  return getProjectsSnapshot();
}

function loadAllActivityTasks(): Task[] {
  return [
    ...loadPersistedTasks("Presale", presaleTasks),
    ...loadPersistedTasks("Diseño", disenoTasks),
    ...loadPersistedTasks("Construcción", operativasTasks),
  ];
}

function availabilityBadgeColor(status: TeamAvailability): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  if (status === "Disponible") return "green";
  if (status === "Medio Tiempo") return "yellow";
  if (status === "Mixto") return "blue";
  if (status === "Permiso") return "purple";
  if (status === "Vacaciones" || status === "Home Office" || status === "Capacitacion") return "gray";
  return "red";
}

function loadBadgeColor(percent: number, isActive: boolean): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  if (!isActive) return "gray";
  if (percent >= 100) return "red";
  if (percent >= 75) return "yellow";
  return "green";
}

function loadLabel(percent: number, isActive: boolean): string {
  if (!isActive) return "Inactivo";
  if (percent >= 100) return "Saturado";
  if (percent >= 75) return "Carga alta";
  return "Disponible";
}

function getSystemRole(member: TeamMember): SystemAccessRole {
  if (isAdministratorRole(member.role) || hasDefaultSystemAdministratorAccess(member.institutionalEmail)) {
    return SYSTEM_ADMIN_ROLE;
  }

  return DEFAULT_SYSTEM_ACCESS_ROLE;
}

function loadSystemRolesMap(): Record<number, SystemAccessRole> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = readStorage(SYSTEM_ROLE_STORAGE_KEY);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<number, string>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.entries(parsed).reduce<Record<number, SystemAccessRole>>((accumulator, [memberId, role]) => {
      const normalized = normalizeSystemAccessRole(role);
      if (normalized) {
        accumulator[Number(memberId)] = normalized;
      }

      return accumulator;
    }, {});
  } catch {
    removeStorage(SYSTEM_ROLE_STORAGE_KEY);
    return {};
  }
}

export default function EquipoPageClient({
  initialTeam,
  initialProjects,
}: {
  initialTeam?: TeamMember[];
  initialProjects?: ReturnType<typeof loadPersistedProjects>;
} = {}) {
  const [members, setMembers] = useState<TeamMember[]>(() => {
    const snapshot =
      initialTeam && initialTeam.length > 0 ? initialTeam : getTeamMembersSnapshot();
    return snapshot.map((member) => normalizeTeamMember(member));
  });
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MemberDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [statusViewFilter, setStatusViewFilter] = useState<"Activos" | "Desactivados">("Activos");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("Todas");
  const [availabilityFilter, setAvailabilityFilter] = useState("Todas");
  const [selectedProfileMemberId, setSelectedProfileMemberId] = useState<number | null>(null);
  const [selectedCoordinatorMemberId, setSelectedCoordinatorMemberId] = useState<number | null>(null);
  const [activityTasks, setActivityTasks] = useState<Task[]>(() => loadAllActivityTasks());
  const [projectsData, setProjectsData] = useState(() =>
    initialProjects && initialProjects.length > 0 ? initialProjects : loadPersistedProjects()
  );
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [systemRoleByMemberId, setSystemRoleByMemberId] = useState<Record<number, SystemAccessRole>>(() => loadSystemRolesMap());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  // Column order is loaded once from the same localStorage key the pre-DataTable
  // markup used (drag-to-reorder is gone now that DataTable owns header
  // rendering; sorting replaces it) so any previously saved order still
  // determines column layout, and export column order stays unchanged.
  const [activeColumnOrder] = useState<ActiveColumnKey[]>(() =>
    loadColumnOrder(ACTIVE_COLUMN_ORDER_STORAGE_KEY, ACTIVE_COLUMN_DEFAULT_ORDER)
  );
  const [inactiveColumnOrder] = useState<InactiveColumnKey[]>(() =>
    loadColumnOrder(INACTIVE_COLUMN_ORDER_STORAGE_KEY, INACTIVE_COLUMN_DEFAULT_ORDER)
  );

  // Diffed autosave: only members that actually changed since the last
  // persisted state are upserted. `lastSavedRef` is seeded from the initial
  // mock state and reset on hydration, so neither the mount value nor the
  // hydration set is written back as a "change".
  const lastSavedRef = useRef<TeamMember[]>(members);
  useEffect(() => {
    const changed = members.filter((member) => {
      const saved = lastSavedRef.current.find((m) => m.id === member.id);
      return !saved || JSON.stringify(member) !== JSON.stringify(saved);
    });
    if (changed.length === 0) return;
    lastSavedRef.current = members;
    saveTeamMembers(changed).catch((err: unknown) => {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    });
  }, [members]);

  useEffect(() => {
    writeStorage(SYSTEM_ROLE_STORAGE_KEY, JSON.stringify(systemRoleByMemberId));
  }, [systemRoleByMemberId]);

  useEffect(() => {
    writeStorage(ACTIVE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(activeColumnOrder));
  }, [activeColumnOrder]);

  useEffect(() => {
    writeStorage(INACTIVE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(inactiveColumnOrder));
  }, [inactiveColumnOrder]);

  // Hidratación async desde Supabase al montar
  useEffect(() => {
    const hydrate = async () => {
      try {
        const [remoteMembers, remoteProjects] = await Promise.all([
          fetchTeamMembers(),
          fetchProjects(),
        ]);

        if (remoteMembers.length > 0) {
          const normalized = remoteMembers.map((m) => normalizeTeamMember(m));
          lastSavedRef.current = normalized;
          setMembers(normalized);
        }

        if (remoteProjects.length > 0) {
          setProjectsData(remoteProjects);
        }
      } catch (err) {
        if (err instanceof RepositoryError) {
          reportRepositoryError(err);
        }
      }
    };

    void hydrate();
  }, []);

  useEffect(() => {
    const refresh = () => {
      setActivityTasks(loadAllActivityTasks());
      setProjectsData(loadPersistedProjects());
      setSecondaryCoordinatorByProject(loadSecondaryCoordinatorMap());
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    const onVisibility = () => {
      if (!document.hidden) {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const activeTasks = activityTasks.filter((task) => !task.archived && task.status !== "Completado");

  const teamCapabilities = useMemo(() => {
    return resolveTeamCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  const membersWithWorkload = useMemo<TeamMemberWithWorkload[]>(() => {
    return members.map((member) => {
      const assigned = activeTasks.filter((task) => task.manager === member.name).length;
      const support = activeTasks.filter((task) => task.support.includes(member.name)).length;
      const total = assigned + support;

      const projects = Array.from(
        new Set(
          activeTasks
            .filter((task) => task.manager === member.name || task.support.includes(member.name))
            .map((task) => task.project)
        )
      );

      const coordinatorProjects = projectsData
        .filter((project) => project.active && project.coordinator === member.name)
        .map((project) => project.name);

      const constructionProjects = projectsData
        .filter((project) => project.active && secondaryCoordinatorByProject[project.id] === member.name)
        .map((project) => project.name);

      const occupancy = Math.round((total / Math.max(member.capacity, 1)) * 100);

      return {
        ...member,
        assigned,
        support,
        total,
        projects,
        coordinatorProjects,
        coordinatorProjectsCount: coordinatorProjects.length,
        constructionProjects,
        constructionProjectsCount: constructionProjects.length,
        occupancy,
        loadLabel: loadLabel(occupancy, member.active),
      };
    });
  }, [members, activeTasks, projectsData, secondaryCoordinatorByProject]);

  const areaOptions = useMemo(() => {
    const values = Array.from(new Set(membersWithWorkload.map((member) => member.area))).sort((a, b) =>
      a.localeCompare(b)
    );

    return ["Todas", ...values];
  }, [membersWithWorkload]);

  const filteredMembers = membersWithWorkload.filter((member) => {
    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      member.name.toLowerCase().includes(searchValue) ||
      member.role.toLowerCase().includes(searchValue) ||
      member.area.toLowerCase().includes(searchValue) ||
      member.institutionalEmail.toLowerCase().includes(searchValue);

    const matchesArea = areaFilter === "Todas" || member.area === areaFilter;
    const matchesAvailability =
      availabilityFilter === "Todas" || member.availability === availabilityFilter;

    return matchesSearch && matchesArea && matchesAvailability;
  });

  const activeVisibleMembers = filteredMembers
    .filter((member) => member.active);

  const inactiveVisibleMembers = filteredMembers
    .filter((member) => !member.active);

  const activeMembers = membersWithWorkload.filter((member) => member.active);

  const overloadedCount = activeMembers.filter((member) => member.occupancy >= 100).length;
  const availableCount = activeMembers.filter((member) => member.occupancy < 75).length;
  const inactiveCount = membersWithWorkload.filter((member) => !member.active).length;
  const selectedProfileMember = membersWithWorkload.find((member) => member.id === selectedProfileMemberId) ?? null;
  const selectedCoordinatorMember = membersWithWorkload.find((member) => member.id === selectedCoordinatorMemberId) ?? null;
  const editorMember = editingId === null ? null : membersWithWorkload.find((member) => member.id === editingId) ?? null;
  const isEditingSelfProtectedAdmin = Boolean(
    editorMember
    && authenticatedUser
    && authenticatedUser.member.id === editorMember.id
    && hasDefaultSystemAdministratorAccess(editorMember.institutionalEmail)
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
      const isTempPasswordBeingEdited = Boolean(draft.temporaryPassword.trim() || draft.temporaryPasswordConfirmation.trim());

      if (!isTempPasswordBeingEdited) {
        return editorAccessState;
      }

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
  const systemRoleOptions = useMemo(() => [...SYSTEM_ACCESS_ROLES], []);

  const resolveSystemRole = (member: TeamMember): SystemAccessRole => {
    const configured = systemRoleByMemberId[member.id];
    if (configured) {
      return configured;
    }

    return getSystemRole(member);
  };

  const openAddEditor = () => {
    if (!teamCapabilities.canCreateCollaborator) {
      return;
    }

    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
    setShowEditor(true);
  };

  const openEditEditor = (member: TeamMember) => {
    if (!teamCapabilities.canEditCollaborator) {
      return;
    }

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

  const saveMember = () => {
    if (editingId === null && !teamCapabilities.canCreateCollaborator) {
      return;
    }

    if (editingId !== null && !teamCapabilities.canEditCollaborator) {
      return;
    }

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
    const shouldAssignTemporaryPassword = draft.systemAccessEnabled && (
      editingId === null || !existingAccessState?.hasPasswordHash || Boolean(tempPassword) || Boolean(tempPasswordConfirmation)
    );
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

    const duplicatedEmail = members.some((member) =>
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
          const normalized = refreshed.map((m) => normalizeTeamMember(m));
          lastSavedRef.current = normalized;
          setMembers(normalized);
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
        setSystemRoleByMemberId((current) => ({
          ...current,
          [nextId]: access,
        }));
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

      setMembers((current) =>
        current.map((member) => (member.id === editingId ? updatedMember : member))
      );

      if (teamCapabilities.canChangeCollaboratorAccess) {
        setSystemRoleByMemberId((current) => ({
          ...current,
          [editingId]: access,
        }));
      }

      if (teamCapabilities.canChangeCollaboratorAccess && (accessEnabledChanged || shouldAssignTemporaryPassword)) {
        void persistCredentialChange(editingId, updatedMember);
      }
    }

    setFormError("");
    setShowEditor(false);
  };

  const toggleMemberActive = (id: number) => {
    if (!teamCapabilities.canToggleCollaboratorActive) {
      return;
    }

    const targetMember = members.find((member) => member.id === id);
    if (targetMember && isPrimaryAdminMember(targetMember)) {
      return;
    }

    setMembers((current) =>
      current.map((member) => {
        if (member.id !== id) {
          return member;
        }

        const nextActive = !member.active;

        return {
          ...member,
          active: nextActive,
          availability: nextActive && member.availability === "No disponible"
            ? "Disponible"
            : !nextActive
              ? "No disponible"
              : member.availability,
        };
      })
    );
  };

  const clearFilters = () => {
    setSearch("");
    setAreaFilter("Todas");
    setAvailabilityFilter("Todas");
  };

  const isPrimaryAdminMember = (member: TeamMember): boolean => {
    return hasDefaultSystemAdministratorAccess(member.institutionalEmail);
  };

  const isSelfProtectedAdmin = (member: TeamMember): boolean => {
    if (!authenticatedUser) {
      return false;
    }

    return authenticatedUser.member.id === member.id && isPrimaryAdminMember(member);
  };

  const isSelfAdminAccessLocked = (member: TeamMember): boolean => {
    if (!authenticatedUser) {
      return false;
    }

    const isSelf = authenticatedUser.member.id === member.id;
    if (!isSelf) {
      return false;
    }

    return resolveSystemRole(member) === SYSTEM_ADMIN_ROLE;
  };

  const updateSystemRole = (memberId: number, nextRole: SystemAccessRole) => {
    if (!teamCapabilities.canChangeCollaboratorAccess) {
      return;
    }

    const targetMember = members.find((member) => member.id === memberId);
    if (targetMember && isSelfAdminAccessLocked(targetMember)) {
      return;
    }

    setSystemRoleByMemberId((current) => ({
      ...current,
      [memberId]: nextRole,
    }));
  };

  const deleteMember = (memberId: number) => {
    if (!teamCapabilities.canDeleteCollaborator) {
      return;
    }

    const targetMember = members.find((member) => member.id === memberId);
    if (targetMember && isPrimaryAdminMember(targetMember)) {
      return;
    }

    setMembers((current) => current.filter((member) => member.id !== memberId));
    setSystemRoleByMemberId((current) => {
      const next = { ...current };
      delete next[memberId];
      return next;
    });

    setSelectedProfileMemberId((current) => (current === memberId ? null : current));
    setSelectedCoordinatorMemberId((current) => (current === memberId ? null : current));
    setEditingId((current) => (current === memberId ? null : current));
  };

  type TeamExportRow = {
    member: TeamMemberWithWorkload;
    rowOrder: number;
  };

  const resolveActiveExportValue = (row: TeamExportRow, column: ActiveColumnKey): string | number => {
    const member = row.member;

    if (column === "order") return row.rowOrder;
    if (column === "colaborador") return member.name;
    if (column === "institutionalEmail") return member.institutionalEmail || "-";
    if (column === "puesto") return member.role;
    if (column === "rol") return resolveSystemRole(member);
    if (column === "area") return member.area;
    if (column === "estado") return member.active ? "Activo" : "Inactivo";
    if (column === "disponibilidad") return member.availability;
    if (column === "liderDiseno") return member.coordinatorProjectsCount;
    if (column === "liderConstruccion") return member.constructionProjectsCount;
    if (column === "responsable") return member.assigned;
    if (column === "soporte") return member.support;
    if (column === "carga") return `${member.occupancy}%`;
    if (column === "proyectos") return member.projects.join(" / ") || "Sin proyectos";

    return "";
  };

  const resolveInactiveExportValue = (row: TeamExportRow, column: InactiveColumnKey): string | number => {
    const member = row.member;

    if (column === "order") return row.rowOrder;
    if (column === "colaborador") return member.name;
    if (column === "institutionalEmail") return member.institutionalEmail || "-";
    if (column === "puesto") return member.role;
    if (column === "rol") return resolveSystemRole(member);
    if (column === "area") return member.area;
    if (column === "disponibilidad") return member.availability;
    if (column === "liderDiseno") return member.coordinatorProjectsCount;
    if (column === "liderConstruccion") return member.constructionProjectsCount;
    if (column === "proyectos") return member.projects.join(" / ") || "Sin proyectos";

    return "";
  };

  const activeExportRows: TeamExportRow[] = activeVisibleMembers.map((member, index) => ({
    member,
    rowOrder: index + 1,
  }));

  const inactiveExportRows: TeamExportRow[] = inactiveVisibleMembers.map((member, index) => ({
    member,
    rowOrder: index + 1,
  }));

  const activeExportColumns: Array<ExportColumn<TeamExportRow>> = activeColumnOrder
    .filter((column) => column !== "acciones")
    .map((column) => ({
      key: column,
      header: ACTIVE_COLUMN_LABEL[column],
      getValue: (row: TeamExportRow) => resolveActiveExportValue(row, column),
    }));

  const inactiveExportColumns: Array<ExportColumn<TeamExportRow>> = inactiveColumnOrder
    .filter((column) => column !== "acciones")
    .map((column) => ({
      key: column,
      header: INACTIVE_COLUMN_LABEL[column],
      getValue: (row: TeamExportRow) => resolveInactiveExportValue(row, column),
    }));

  const exportActiveTeam = async (format: "xlsx" | "pdf") => {
    const { settings } = loadGeneralSettings();

    await exportTableData({
      moduleName: "Equipo (Activos)",
      fileName: `equipo-activos-${buildTimestampLabel()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: activeExportColumns,
      rows: activeExportRows,
      landscape: true,
    });
  };

  const exportInactiveTeam = async (format: "xlsx" | "pdf") => {
    const { settings } = loadGeneralSettings();

    await exportTableData({
      moduleName: "Equipo (Desactivados)",
      fileName: `equipo-desactivados-${buildTimestampLabel()}`,
      format,
      companyName: settings.company.tradeName || settings.company.legalName,
      columns: inactiveExportColumns,
      rows: inactiveExportRows,
      landscape: true,
    });
  };

  // Cell content (no <td> — DataTable's <td className="px-4 py-3"> wraps this).
  const renderActiveCell = (member: TeamMemberWithWorkload, column: ActiveColumnKey) => {
    if (column === "order") {
      return <span className="block w-[28px] text-center text-xs font-medium text-slate-600">...</span>;
    }

    if (column === "colaborador") {
      return (
        <div className="min-w-[240px]">
          <Avatar name={member.name} />
        </div>
      );
    }

    if (column === "institutionalEmail") {
      return <span className="text-sm text-slate-700">{member.institutionalEmail || "-"}</span>;
    }

    if (column === "puesto") {
      return <span className="text-sm font-medium">{member.role}</span>;
    }

    if (column === "rol") {
      const isLocked = isSelfAdminAccessLocked(member);
      const canEditAccess = teamCapabilities.canChangeCollaboratorAccess && !isLocked;

      return (
        <select
          value={resolveSystemRole(member)}
          onChange={(event) => updateSystemRole(member.id, normalizeSystemAccessRole(event.target.value) ?? DEFAULT_SYSTEM_ACCESS_ROLE)}
          disabled={!canEditAccess}
          title={isLocked ? "Tu acceso de Administrador esta protegido en esta tabla" : teamCapabilities.canChangeCollaboratorAccess ? "" : "No tienes permiso para cambiar el acceso"}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
        >
          {systemRoleOptions.map((roleOption) => (
            <option key={roleOption} value={roleOption}>{roleOption}</option>
          ))}
        </select>
      );
    }

    if (column === "area") {
      return <span className="text-sm">{member.area}</span>;
    }

    if (column === "estado") {
      return <Badge label={member.active ? "Activo" : "Inactivo"} color={member.active ? "blue" : "gray"} />;
    }

    if (column === "disponibilidad") {
      return <Badge label={member.availability} color={availabilityBadgeColor(member.availability)} />;
    }

    if (column === "liderDiseno") {
      return member.coordinatorProjectsCount === 0 ? (
        <span className="text-slate-600">0</span>
      ) : (
        <button
          type="button"
          onClick={() => setSelectedCoordinatorMemberId(member.id)}
          className="font-medium text-slate-800 hover:text-blue-700 hover:underline"
        >
          {member.coordinatorProjectsCount}
        </button>
      );
    }

    if (column === "liderConstruccion") {
      return (
        <span className="text-sm text-slate-800" suppressHydrationWarning>
          {member.constructionProjectsCount === 0 ? (
            <span className="text-slate-600">0</span>
          ) : (
            <span className="font-medium">{member.constructionProjectsCount}</span>
          )}
        </span>
      );
    }

    if (column === "responsable") {
      return <span className="text-sm">{member.assigned}</span>;
    }

    if (column === "soporte") {
      return <span className="text-sm">{member.support}</span>;
    }

    if (column === "carga") {
      return (
        <div className="flex items-center gap-2">
          <Badge label={member.loadLabel} color={loadBadgeColor(member.occupancy, member.active)} />
          <span className="text-xs text-slate-800">{member.occupancy}%</span>
        </div>
      );
    }

    if (column === "proyectos") {
      return member.projects.length === 0 ? (
        <span className="text-sm text-slate-600">Sin proyectos</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {member.projects.map((project) => (
            <span key={`${member.id}-${project}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              {project}
            </span>
          ))}
        </div>
      );
    }

    const isProtectedSelf = isSelfProtectedAdmin(member);
    const isPrimaryAdmin = isPrimaryAdminMember(member);
    const canToggle = teamCapabilities.canToggleCollaboratorActive && !isProtectedSelf;
    const canDelete = teamCapabilities.canDeleteCollaborator && !isPrimaryAdmin;

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedProfileMemberId(member.id)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Abrir ficha
        </button>

        <button
          type="button"
          onClick={() => openEditEditor(member)}
          disabled={!teamCapabilities.canEditCollaborator}
          title={teamCapabilities.canEditCollaborator ? "" : "No tienes permiso para editar colaboradores"}
          className={`rounded-lg border px-3 py-1 text-xs font-medium ${teamCapabilities.canEditCollaborator ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
        >
          Editar
        </button>

        <button
          type="button"
          onClick={() => toggleMemberActive(member.id)}
          disabled={!canToggle}
          title={isProtectedSelf ? "No puedes desactivar tu cuenta administradora principal" : teamCapabilities.canToggleCollaboratorActive ? "" : "No tienes permiso para activar o desactivar colaboradores"}
          className={`rounded-lg border px-3 py-1 text-xs font-medium ${canToggle ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
        >
          Desactivar
        </button>

        {!isPrimaryAdmin ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Eliminar a ${member.name} del equipo? Esta acción no se puede deshacer.`)) {
                deleteMember(member.id);
              }
            }}
            disabled={!canDelete}
            title={teamCapabilities.canDeleteCollaborator ? "" : "Solo Administrador puede eliminar colaboradores"}
            className={`rounded-lg border px-3 py-1 text-xs font-medium ${canDelete ? "border-red-200 text-red-700 hover:bg-red-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
          >
            Eliminar
          </button>
        ) : null}
      </div>
    );
  };

  const renderInactiveCell = (member: TeamMemberWithWorkload, column: InactiveColumnKey) => {
    if (column === "order") {
      return <span className="block w-[28px] text-center text-xs font-medium text-slate-600">-</span>;
    }

    if (column === "colaborador") {
      return (
        <div className="min-w-[240px]">
          <Avatar name={member.name} />
        </div>
      );
    }

    if (column === "institutionalEmail") {
      return <span className="text-sm text-slate-700">{member.institutionalEmail || "-"}</span>;
    }

    if (column === "puesto") {
      return <span className="text-sm font-medium">{member.role}</span>;
    }

    if (column === "rol") {
      const isLocked = isSelfAdminAccessLocked(member);
      const canEditAccess = teamCapabilities.canChangeCollaboratorAccess && !isLocked;

      return (
        <select
          value={resolveSystemRole(member)}
          onChange={(event) => updateSystemRole(member.id, normalizeSystemAccessRole(event.target.value) ?? DEFAULT_SYSTEM_ACCESS_ROLE)}
          disabled={!canEditAccess}
          title={isLocked ? "Tu acceso de Administrador esta protegido en esta tabla" : teamCapabilities.canChangeCollaboratorAccess ? "" : "No tienes permiso para cambiar el acceso"}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
        >
          {systemRoleOptions.map((roleOption) => (
            <option key={roleOption} value={roleOption}>{roleOption}</option>
          ))}
        </select>
      );
    }

    if (column === "area") {
      return <span className="text-sm">{member.area}</span>;
    }

    if (column === "disponibilidad") {
      return <Badge label={member.availability} color={availabilityBadgeColor(member.availability)} />;
    }

    if (column === "liderDiseno") {
      return member.coordinatorProjectsCount === 0 ? (
        <span className="text-sm text-slate-600">0</span>
      ) : (
        <button
          type="button"
          onClick={() => setSelectedCoordinatorMemberId(member.id)}
          className="text-sm font-medium text-slate-800 hover:text-blue-700 hover:underline"
        >
          {member.coordinatorProjectsCount}
        </button>
      );
    }

    if (column === "liderConstruccion") {
      return (
        <span className="text-sm text-slate-800" suppressHydrationWarning>
          {member.constructionProjectsCount === 0 ? (
            <span className="text-slate-600">0</span>
          ) : (
            <span className="font-medium">{member.constructionProjectsCount}</span>
          )}
        </span>
      );
    }

    if (column === "proyectos") {
      return member.projects.length === 0 ? (
        <span className="text-sm text-slate-600">Sin proyectos</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {member.projects.map((project) => (
            <span key={`${member.id}-inactive-${project}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              {project}
            </span>
          ))}
        </div>
      );
    }

    const isProtectedSelf = isSelfProtectedAdmin(member);
    const isPrimaryAdmin = isPrimaryAdminMember(member);
    const canToggle = teamCapabilities.canToggleCollaboratorActive && !isProtectedSelf;
    const canDelete = teamCapabilities.canDeleteCollaborator && !isPrimaryAdmin;

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedProfileMemberId(member.id)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white"
        >
          Abrir ficha
        </button>

        <button
          type="button"
          onClick={() => openEditEditor(member)}
          disabled={!teamCapabilities.canEditCollaborator}
          title={teamCapabilities.canEditCollaborator ? "" : "No tienes permiso para editar colaboradores"}
          className={`rounded-lg border px-3 py-1 text-xs font-medium ${teamCapabilities.canEditCollaborator ? "border-slate-200 text-slate-600 hover:bg-white" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => toggleMemberActive(member.id)}
          disabled={!canToggle}
          title={isProtectedSelf ? "No puedes desactivar tu cuenta administradora principal" : teamCapabilities.canToggleCollaboratorActive ? "" : "No tienes permiso para activar o desactivar colaboradores"}
          className={`rounded-lg border px-3 py-1 text-xs font-medium ${canToggle ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
        >
          Reactivar
        </button>
        {!isPrimaryAdmin ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Eliminar a ${member.name} del equipo? Esta acción no se puede deshacer.`)) {
                deleteMember(member.id);
              }
            }}
            disabled={!canDelete}
            title={teamCapabilities.canDeleteCollaborator ? "" : "Solo Administrador puede eliminar colaboradores"}
            className={`rounded-lg border px-3 py-1 text-xs font-medium ${canDelete ? "border-red-200 text-red-700 hover:bg-red-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
          >
            Eliminar
          </button>
        ) : null}
      </div>
    );
  };

  const sortableStringAccessor = (getValue: (member: TeamMemberWithWorkload) => string) => getValue;
  const sortableNumberAccessor = (getValue: (member: TeamMemberWithWorkload) => number) => getValue;

  const activeColumns: ColumnDef<TeamMemberWithWorkload, unknown>[] = activeColumnOrder.map((column) => {
    const base = {
      id: column,
      header: ACTIVE_COLUMN_LABEL[column],
      cell: ({ row }: { row: { original: TeamMemberWithWorkload } }) => renderActiveCell(row.original, column),
    };

    if (column === "colaborador") return { ...base, accessorFn: sortableStringAccessor((m) => m.name) };
    if (column === "institutionalEmail") return { ...base, accessorFn: sortableStringAccessor((m) => m.institutionalEmail) };
    if (column === "puesto") return { ...base, accessorFn: sortableStringAccessor((m) => m.role) };
    if (column === "rol") return { ...base, accessorFn: sortableStringAccessor((m) => resolveSystemRole(m)) };
    if (column === "area") return { ...base, accessorFn: sortableStringAccessor((m) => m.area) };
    if (column === "estado") return { ...base, accessorFn: sortableNumberAccessor((m) => (m.active ? 1 : 0)) };
    if (column === "disponibilidad") return { ...base, accessorFn: sortableStringAccessor((m) => m.availability) };
    if (column === "liderDiseno") return { ...base, accessorFn: sortableNumberAccessor((m) => m.coordinatorProjectsCount) };
    if (column === "liderConstruccion") return { ...base, accessorFn: sortableNumberAccessor((m) => m.constructionProjectsCount) };
    if (column === "responsable") return { ...base, accessorFn: sortableNumberAccessor((m) => m.assigned) };
    if (column === "soporte") return { ...base, accessorFn: sortableNumberAccessor((m) => m.support) };
    if (column === "carga") return { ...base, accessorFn: sortableNumberAccessor((m) => m.occupancy) };

    // order, proyectos, acciones have no natural sortable primitive.
    return { ...base, enableSorting: false };
  });

  const inactiveColumns: ColumnDef<TeamMemberWithWorkload, unknown>[] = inactiveColumnOrder.map((column) => {
    const base = {
      id: column,
      header: INACTIVE_COLUMN_LABEL[column],
      cell: ({ row }: { row: { original: TeamMemberWithWorkload } }) => renderInactiveCell(row.original, column),
    };

    if (column === "colaborador") return { ...base, accessorFn: sortableStringAccessor((m) => m.name) };
    if (column === "institutionalEmail") return { ...base, accessorFn: sortableStringAccessor((m) => m.institutionalEmail) };
    if (column === "puesto") return { ...base, accessorFn: sortableStringAccessor((m) => m.role) };
    if (column === "rol") return { ...base, accessorFn: sortableStringAccessor((m) => resolveSystemRole(m)) };
    if (column === "area") return { ...base, accessorFn: sortableStringAccessor((m) => m.area) };
    if (column === "disponibilidad") return { ...base, accessorFn: sortableStringAccessor((m) => m.availability) };
    if (column === "liderDiseno") return { ...base, accessorFn: sortableNumberAccessor((m) => m.coordinatorProjectsCount) };
    if (column === "liderConstruccion") return { ...base, accessorFn: sortableNumberAccessor((m) => m.constructionProjectsCount) };

    // order, proyectos, acciones have no natural sortable primitive.
    return { ...base, enableSorting: false };
  });

  if (!teamCapabilities.canViewTeam) {
    return (
      <main className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <section className="flex-1 overflow-y-auto p-10">
          <Header />
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Sin acceso al modulo Equipo</h1>
            <p className="mt-2 text-sm text-slate-600">Tu acceso actual no permite visualizar la información del equipo.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Volver al dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Equipo</h1>
                <p className="mt-1 text-slate-700">Avatares, capacidad y carga actual de colaboradores.</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={openAddEditor}
                  disabled={!teamCapabilities.canCreateCollaborator}
                  title={teamCapabilities.canCreateCollaborator ? "" : "No tienes permiso para crear colaboradores"}
                  className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${teamCapabilities.canCreateCollaborator ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"}`}
                >
                  + Agregar colaborador
                </button>

                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setStatusViewFilter("Activos")}
                    className={`rounded-lg px-3 py-1 text-xs font-medium ${statusViewFilter === "Activos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    Activos
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusViewFilter("Desactivados")}
                    className={`rounded-lg px-3 py-1 text-xs font-medium ${statusViewFilter === "Desactivados" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    Desactivados
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar colaborador, acceso o area..."
                className="h-10 w-72 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-500"
              />

              <select
                value={areaFilter}
                onChange={(event) => setAreaFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
              >
                {areaOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
              >
                <option value="Todas">Todas las disponibilidades</option>
                {availabilityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={clearFilters}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Limpiar filtros
              </button>

              {teamCapabilities.canExportData ? (
                <ExportMenu onExport={statusViewFilter === "Activos" ? exportActiveTeam : exportInactiveTeam} scaleClassName="scale-100" />
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-200 p-6 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-700">Activos</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{activeMembers.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-700">Desactivados</p>
              <p className="mt-1 text-2xl font-bold text-slate-700">{inactiveCount}</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
              <p className="text-sm text-slate-700">Saturados</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{overloadedCount}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
              <p className="text-sm text-slate-700">Disponibles</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{availableCount}</p>
            </div>
          </div>

          {statusViewFilter === "Activos" ? (
          <div className="p-6">
            <DataTable
              columns={activeColumns}
              data={activeVisibleMembers}
              getRowId={(member) => String(member.id)}
              rowClassName={() => "hover:bg-slate-50/70"}
              emptyMessage="No hay colaboradores activos con los filtros actuales."
              tableClassName="min-w-[1320px]"
              wrapperClassName="border-0 shadow-none"
            />
          </div>
          ) : null}

          {statusViewFilter === "Desactivados" ? (
          <div className="border-t border-slate-200 px-6 pb-6">
            <div className="mb-4 mt-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Desactivados</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700">{inactiveVisibleMembers.length} visibles</span>
              </div>
            </div>

            <DataTable
              columns={inactiveColumns}
              data={inactiveVisibleMembers}
              getRowId={(member) => String(member.id)}
              rowClassName={() => "bg-slate-50/60"}
              emptyMessage="No hay colaboradores desactivados con los filtros actuales."
              tableClassName="min-w-[1160px]"
              wrapperClassName="rounded-xl"
            />
          </div>
          ) : null}

          <div className="border-t border-slate-200 px-6 py-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Fichas personales</h2>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredMembers.map((member) => (
                <div key={`card-${member.id}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Avatar name={member.name} />
                    <Badge label={member.active ? "Activo" : "Desactivado"} color={member.active ? "blue" : "gray"} />
                  </div>

                  <div className="space-y-1 text-sm text-slate-600">
                    <p><span className="font-medium text-slate-700">Fecha nacimiento:</span> {member.birthDate || "-"}</p>
                    <p><span className="font-medium text-slate-700">Nacionalidad:</span> {member.nationality || "-"}</p>
                    <p><span className="font-medium text-slate-700">Celular:</span> {member.phone || "-"}</p>
                    <p><span className="font-medium text-slate-700">Correo institucional:</span> {member.institutionalEmail || "-"}</p>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setSelectedProfileMemberId(member.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Abrir ficha
                    </button>
                  </div>
                </div>
              ))}

              {filteredMembers.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  No hay fichas personales con los filtros actuales.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <MemberEditorDrawer
          show={showEditor}
          onClose={() => { setFormError(""); setShowEditor(false); }}
          editingId={editingId}
          draft={draft}
          onChangeDraft={setDraft}
          formError={formError}
          onSave={saveMember}
          accessPreviewState={accessPreviewState}
          isEditingSelfProtectedAdmin={isEditingSelfProtectedAdmin}
          teamCapabilities={teamCapabilities}
          availabilityOptions={availabilityOptions}
        />

        {selectedCoordinatorMember ? (
          <CoordinatorProjectsModal
            member={selectedCoordinatorMember}
            onClose={() => setSelectedCoordinatorMemberId(null)}
          />
        ) : null}

        {selectedProfileMember ? (
          <MemberProfileModal
            member={selectedProfileMember}
            onClose={() => setSelectedProfileMemberId(null)}
          />
        ) : null}
      </section>
    </main>
  );
}