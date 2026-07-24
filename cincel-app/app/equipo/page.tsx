"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { getCollaboratorAccessState, hashPassword, normalizeEmail } from "@/lib/auth/auth-service";
import { teamMembers, type TeamAvailability, type TeamMember } from "@/lib/data/team";
import { projects as baseProjects } from "@/lib/data/projects";
import { DEFAULT_SYSTEM_ACCESS_ROLE, SYSTEM_ACCESS_ROLES, SYSTEM_ADMIN_ROLE, hasDefaultSystemAdministratorAccess, isAdministratorRole, normalizeSystemAccessRole, type SystemAccessRole } from "@/lib/data/roles";
import type { Task } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { loadLinkedTasks } from "@/lib/utils/tasks-linking";

type MemberDraft = {
  name: string;
  access: SystemAccessRole;
  systemAccessEnabled: boolean;
  temporaryPassword: string;
  temporaryPasswordConfirmation: string;
  birthDate: string;
  nationality: string;
  phone: string;
  institutionalEmail: string;
  address: string;
  maritalStatus: string;
  homePhone: string;
  personalEmail: string;
  curp: string;
  rfc: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  emergencyContactAddress: string;
  role: string;
  area: string;
  capacity: number;
  availability: TeamAvailability;
};

type TeamMemberWithWorkload = TeamMember & {
  assigned: number;
  support: number;
  total: number;
  projects: string[];
  coordinatorProjects: string[];
  coordinatorProjectsCount: number;
  constructionProjects: string[];
  constructionProjectsCount: number;
  occupancy: number;
  loadLabel: string;
};

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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

const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";
const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";
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

function getActiveHeaderWidthClass(column: ActiveColumnKey): string {
  if (column === "order") return "w-[44px] min-w-[44px] max-w-[44px]";
  if (column === "colaborador") return "min-w-[280px]";
  return "";
}

function getInactiveHeaderWidthClass(column: InactiveColumnKey): string {
  if (column === "order") return "w-[44px] min-w-[44px] max-w-[44px]";
  if (column === "colaborador") return "min-w-[280px]";
  return "";
}

function loadColumnOrder<T extends string>(storageKey: string, defaults: T[]): T[] {
  if (typeof window === "undefined") {
    return defaults;
  }

  const stored = localStorage.getItem(storageKey);
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

function reorderColumns<T extends string>(columns: T[], source: T, target: T): T[] {
  if (source === target) {
    return columns;
  }

  const sourceIndex = columns.indexOf(source);
  const targetIndex = columns.indexOf(target);

  if (sourceIndex === -1 || targetIndex === -1) {
    return columns;
  }

  const next = [...columns];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function loadSecondaryCoordinatorMap(): Record<number, string> {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem(SECONDARY_COORDINATOR_STORAGE_KEY);
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
  if (typeof window === "undefined") {
    return baseProjects;
  }

  const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);

  if (!stored) {
    return baseProjects;
  }

  try {
    const parsed = JSON.parse(stored) as typeof baseProjects;
    return Array.isArray(parsed) ? parsed : baseProjects;
  } catch {
    localStorage.removeItem(PROJECTS_STORAGE_KEY);
    return baseProjects;
  }
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

  const stored = localStorage.getItem(SYSTEM_ROLE_STORAGE_KEY);
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
    localStorage.removeItem(SYSTEM_ROLE_STORAGE_KEY);
    return {};
  }
}

export default function EquipoPage() {
  const [members, setMembers] = useState<TeamMember[]>(() => {
    if (typeof window === "undefined") {
      return teamMembers;
    }

    const stored = localStorage.getItem(TEAM_MEMBERS_STORAGE_KEY);

    if (!stored) {
      return teamMembers;
    }

    try {
      const parsed = JSON.parse(stored) as TeamMember[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((member) => normalizeTeamMember(member));
      }
    } catch {
      localStorage.removeItem(TEAM_MEMBERS_STORAGE_KEY);
    }

    return teamMembers.map((member) => normalizeTeamMember(member));
  });
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MemberDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("Todas");
  const [availabilityFilter, setAvailabilityFilter] = useState("Todas");
  const [selectedProfileMemberId, setSelectedProfileMemberId] = useState<number | null>(null);
  const [selectedCoordinatorMemberId, setSelectedCoordinatorMemberId] = useState<number | null>(null);
  const [draggingMemberId, setDraggingMemberId] = useState<number | null>(null);
  const [activityTasks, setActivityTasks] = useState<Task[]>(() => loadAllActivityTasks());
  const [projectsData, setProjectsData] = useState(() => loadPersistedProjects());
  const [secondaryCoordinatorByProject, setSecondaryCoordinatorByProject] = useState<Record<number, string>>(() => loadSecondaryCoordinatorMap());
  const [systemRoleByMemberId, setSystemRoleByMemberId] = useState<Record<number, SystemAccessRole>>(() => loadSystemRolesMap());
  const [activeColumnOrder, setActiveColumnOrder] = useState<ActiveColumnKey[]>(() =>
    loadColumnOrder(ACTIVE_COLUMN_ORDER_STORAGE_KEY, ACTIVE_COLUMN_DEFAULT_ORDER)
  );
  const [inactiveColumnOrder, setInactiveColumnOrder] = useState<InactiveColumnKey[]>(() =>
    loadColumnOrder(INACTIVE_COLUMN_ORDER_STORAGE_KEY, INACTIVE_COLUMN_DEFAULT_ORDER)
  );
  const [draggingActiveColumn, setDraggingActiveColumn] = useState<ActiveColumnKey | null>(null);
  const [draggingInactiveColumn, setDraggingInactiveColumn] = useState<InactiveColumnKey | null>(null);

  useEffect(() => {
    localStorage.setItem(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(members));
  }, [members]);

  useEffect(() => {
    localStorage.setItem(SYSTEM_ROLE_STORAGE_KEY, JSON.stringify(systemRoleByMemberId));
  }, [systemRoleByMemberId]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(activeColumnOrder));
  }, [activeColumnOrder]);

  useEffect(() => {
    localStorage.setItem(INACTIVE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(inactiveColumnOrder));
  }, [inactiveColumnOrder]);

  useEffect(() => {
    const releaseDrag = () => {
      setDraggingActiveColumn(null);
      setDraggingInactiveColumn(null);
    };

    window.addEventListener("mouseup", releaseDrag);

    return () => {
      window.removeEventListener("mouseup", releaseDrag);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setActivityTasks(loadAllActivityTasks());
      setProjectsData(loadPersistedProjects());
      setSecondaryCoordinatorByProject(loadSecondaryCoordinatorMap());
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
  const editorAccessState = editorMember ? getCollaboratorAccessState(editorMember) : null;
  const accessPreviewState = useMemo(() => {
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
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
    setShowEditor(true);
  };

  const openEditEditor = (member: TeamMember) => {
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
    const existingAuth = existingMember?.auth ?? null;
    const shouldAssignTemporaryPassword = draft.systemAccessEnabled && (
      editingId === null || !existingAuth?.passwordHash || Boolean(tempPassword) || Boolean(tempPasswordConfirmation)
    );

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
        auth: draft.systemAccessEnabled
          ? {
              passwordHash: hashPassword(tempPassword),
              authEnabled: true,
              mustChangePassword: true,
              passwordUpdatedAt: null,
              lastLoginAt: null,
            }
          : undefined,
      };

      setMembers((current) => [...current, newMember]);
      setSystemRoleByMemberId((current) => ({
        ...current,
        [nextId]: access,
      }));
    } else {
      setMembers((current) =>
        current.map((member) =>
          member.id === editingId
            ? {
                ...member,
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
                auth: draft.systemAccessEnabled
                  ? shouldAssignTemporaryPassword
                    ? {
                        passwordHash: hashPassword(tempPassword),
                        authEnabled: true,
                        mustChangePassword: true,
                        passwordUpdatedAt: null,
                        lastLoginAt: member.auth?.lastLoginAt ?? null,
                      }
                    : {
                        passwordHash: member.auth?.passwordHash ?? "",
                        authEnabled: true,
                        mustChangePassword: member.auth?.mustChangePassword ?? false,
                        passwordUpdatedAt: member.auth?.passwordUpdatedAt ?? null,
                        lastLoginAt: member.auth?.lastLoginAt ?? null,
                      }
                  : member.auth
                    ? {
                        ...member.auth,
                        authEnabled: false,
                      }
                    : undefined,
              }
            : member
        )
      );

      setSystemRoleByMemberId((current) => ({
        ...current,
        [editingId]: access,
      }));
    }

    setFormError("");
    setShowEditor(false);
  };

  const toggleMemberActive = (id: number) => {
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

  const reorderMembers = (sourceId: number, targetId: number) => {
    if (sourceId === targetId) {
      return;
    }

    setMembers((current) => {
      const sourceIndex = current.findIndex((member) => member.id === sourceId);
      const targetIndex = current.findIndex((member) => member.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);

      return next;
    });
  };

  const updateSystemRole = (memberId: number, nextRole: SystemAccessRole) => {
    setSystemRoleByMemberId((current) => ({
      ...current,
      [memberId]: nextRole,
    }));
  };

  const onDropActiveColumn = (target: ActiveColumnKey, sourceFromEvent?: string) => {
    const source = (sourceFromEvent as ActiveColumnKey | undefined) ?? draggingActiveColumn;
    if (!source) {
      return;
    }

    setActiveColumnOrder((current) => reorderColumns(current, source, target));
    setDraggingActiveColumn(null);
  };

  const onDropInactiveColumn = (target: InactiveColumnKey, sourceFromEvent?: string) => {
    const source = (sourceFromEvent as InactiveColumnKey | undefined) ?? draggingInactiveColumn;
    if (!source) {
      return;
    }

    setInactiveColumnOrder((current) => reorderColumns(current, source, target));
    setDraggingInactiveColumn(null);
  };

  const onMouseEnterActiveColumn = (target: ActiveColumnKey) => {
    if (!draggingActiveColumn || draggingActiveColumn === target) {
      return;
    }

    setActiveColumnOrder((current) => reorderColumns(current, draggingActiveColumn, target));
    setDraggingActiveColumn(target);
  };

  const onMouseEnterInactiveColumn = (target: InactiveColumnKey) => {
    if (!draggingInactiveColumn || draggingInactiveColumn === target) {
      return;
    }

    setInactiveColumnOrder((current) => reorderColumns(current, draggingInactiveColumn, target));
    setDraggingInactiveColumn(target);
  };

  const renderActiveCell = (member: TeamMemberWithWorkload, column: ActiveColumnKey) => {
    if (column === "order") {
      return (
        <td className="w-[44px] min-w-[44px] max-w-[44px] px-2 py-3 text-center text-xs font-medium text-slate-600">
          ...
        </td>
      );
    }

    if (column === "colaborador") {
      return (
        <td className="min-w-[280px] px-4 py-3">
          <Avatar name={member.name} />
        </td>
      );
    }

    if (column === "institutionalEmail") {
      return <td className="px-4 py-3 text-sm text-slate-700">{member.institutionalEmail || "-"}</td>;
    }

    if (column === "puesto") {
      return <td className="px-4 py-3 text-sm font-medium">{member.role}</td>;
    }

    if (column === "rol") {
      return (
        <td className="px-4 py-3 text-sm">
          <select
            value={resolveSystemRole(member)}
            onChange={(event) => updateSystemRole(member.id, normalizeSystemAccessRole(event.target.value) ?? DEFAULT_SYSTEM_ACCESS_ROLE)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
          >
            {systemRoleOptions.map((roleOption) => (
              <option key={roleOption} value={roleOption}>{roleOption}</option>
            ))}
          </select>
        </td>
      );
    }

    if (column === "area") {
      return <td className="px-4 py-3 text-sm">{member.area}</td>;
    }

    if (column === "estado") {
      return (
        <td className="px-4 py-3">
          <Badge label={member.active ? "Activo" : "Inactivo"} color={member.active ? "blue" : "gray"} />
        </td>
      );
    }

    if (column === "disponibilidad") {
      return (
        <td className="px-4 py-3">
          <Badge label={member.availability} color={availabilityBadgeColor(member.availability)} />
        </td>
      );
    }

    if (column === "liderDiseno") {
      return (
        <td className="px-4 py-3">
          {member.coordinatorProjectsCount === 0 ? (
            <span className="text-slate-600">0</span>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedCoordinatorMemberId(member.id)}
              className="font-medium text-slate-800 hover:text-blue-700 hover:underline"
            >
              {member.coordinatorProjectsCount}
            </button>
          )}
        </td>
      );
    }

    if (column === "liderConstruccion") {
      return (
        <td className="px-4 py-3 text-sm text-slate-800" suppressHydrationWarning>
          {member.constructionProjectsCount === 0 ? (
            <span className="text-slate-600">0</span>
          ) : (
            <span className="font-medium">{member.constructionProjectsCount}</span>
          )}
        </td>
      );
    }

    if (column === "responsable") {
      return <td className="px-4 py-3 text-sm">{member.assigned}</td>;
    }

    if (column === "soporte") {
      return <td className="px-4 py-3 text-sm">{member.support}</td>;
    }

    if (column === "carga") {
      return (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge label={member.loadLabel} color={loadBadgeColor(member.occupancy, member.active)} />
            <span className="text-xs text-slate-800">{member.occupancy}%</span>
          </div>
        </td>
      );
    }

    if (column === "proyectos") {
      return (
        <td className="px-4 py-3">
          {member.projects.length === 0 ? (
            <span className="text-sm text-slate-600">Sin proyectos</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {member.projects.map((project) => (
                <span key={`${member.id}-${project}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                  {project}
                </span>
              ))}
            </div>
          )}
        </td>
      );
    }

    return (
      <td className="px-4 py-3">
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
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Editar
          </button>

          <button
            type="button"
            onClick={() => toggleMemberActive(member.id)}
            className="rounded-lg border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            Desactivar
          </button>
        </div>
      </td>
    );
  };

  const renderInactiveCell = (member: TeamMemberWithWorkload, column: InactiveColumnKey) => {
    if (column === "order") {
      return <td className="w-[44px] min-w-[44px] max-w-[44px] px-2 py-3 text-center text-xs font-medium text-slate-600">-</td>;
    }

    if (column === "colaborador") {
      return (
        <td className="min-w-[280px] px-4 py-3">
          <Avatar name={member.name} />
        </td>
      );
    }

    if (column === "institutionalEmail") {
      return <td className="px-4 py-3 text-sm text-slate-700">{member.institutionalEmail || "-"}</td>;
    }

    if (column === "puesto") {
      return <td className="px-4 py-3 text-sm font-medium">{member.role}</td>;
    }

    if (column === "rol") {
      return (
        <td className="px-4 py-3 text-sm">
          <select
            value={resolveSystemRole(member)}
            onChange={(event) => updateSystemRole(member.id, normalizeSystemAccessRole(event.target.value) ?? DEFAULT_SYSTEM_ACCESS_ROLE)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
          >
            {systemRoleOptions.map((roleOption) => (
              <option key={roleOption} value={roleOption}>{roleOption}</option>
            ))}
          </select>
        </td>
      );
    }

    if (column === "area") {
      return <td className="px-4 py-3 text-sm">{member.area}</td>;
    }

    if (column === "disponibilidad") {
      return (
        <td className="px-4 py-3">
          <Badge label={member.availability} color={availabilityBadgeColor(member.availability)} />
        </td>
      );
    }

    if (column === "liderDiseno") {
      return (
        <td className="px-4 py-3">
          {member.coordinatorProjectsCount === 0 ? (
            <span className="text-sm text-slate-600">0</span>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedCoordinatorMemberId(member.id)}
              className="text-sm font-medium text-slate-800 hover:text-blue-700 hover:underline"
            >
              {member.coordinatorProjectsCount}
            </button>
          )}
        </td>
      );
    }

    if (column === "liderConstruccion") {
      return (
        <td className="px-4 py-3 text-sm text-slate-800" suppressHydrationWarning>
          {member.constructionProjectsCount === 0 ? (
            <span className="text-slate-600">0</span>
          ) : (
            <span className="font-medium">{member.constructionProjectsCount}</span>
          )}
        </td>
      );
    }

    if (column === "proyectos") {
      return (
        <td className="px-4 py-3">
          {member.projects.length === 0 ? (
            <span className="text-sm text-slate-600">Sin proyectos</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {member.projects.map((project) => (
                <span key={`${member.id}-inactive-${project}`} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                  {project}
                </span>
              ))}
            </div>
          )}
        </td>
      );
    }

    return (
      <td className="px-4 py-3">
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
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => toggleMemberActive(member.id)}
            className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Reactivar
          </button>
        </div>
      </td>
    );
  };

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold">Equipo</h1>
                <p className="mt-1 text-slate-700">Avatares, capacidad y carga actual de colaboradores.</p>
              </div>

              <button
                type="button"
                onClick={openAddEditor}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Agregar colaborador
              </button>
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

          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar colaborador, acceso o area..."
                className="w-72 rounded-xl border border-slate-200 px-4 py-2 text-sm"
              />

              <select
                value={areaFilter}
                onChange={(event) => setAreaFilter(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
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
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
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
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="overflow-x-auto p-6">
            <table className="min-w-[1320px] w-full text-slate-800">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-800">
                <tr>
                  {activeColumnOrder.map((column) => (
                    <th
                      key={`active-header-${column}`}
                      draggable
                      onMouseDown={() => setDraggingActiveColumn(column)}
                      onMouseEnter={() => onMouseEnterActiveColumn(column)}
                      onDragStart={(event) => {
                        setDraggingActiveColumn(column);
                        event.dataTransfer.setData("text/plain", column);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        onDropActiveColumn(column, event.dataTransfer.getData("text/plain"));
                      }}
                      onDragEnd={() => setDraggingActiveColumn(null)}
                      className={`px-4 py-3 select-none ${getActiveHeaderWidthClass(column)} ${draggingActiveColumn === column ? "opacity-60" : ""}`}
                      title="Arrastra para mover columna"
                    >
                      <span className="whitespace-nowrap">{ACTIVE_COLUMN_LABEL[column]}</span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {activeVisibleMembers.map((member) => (
                  <tr
                    key={member.id}
                    draggable
                    onDragStart={() => setDraggingMemberId(member.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggingMemberId !== null) {
                        reorderMembers(draggingMemberId, member.id);
                      }
                      setDraggingMemberId(null);
                    }}
                    onDragEnd={() => setDraggingMemberId(null)}
                    className={`border-b border-slate-100 hover:bg-slate-50/70 ${draggingMemberId === member.id ? "opacity-60" : ""}`}
                  >
                    {activeColumnOrder.map((column) => (
                      <Fragment key={`active-cell-${member.id}-${column}`}>
                        {renderActiveCell(member, column)}
                      </Fragment>
                    ))}
                  </tr>
                ))}

                {activeVisibleMembers.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumnOrder.length} className="px-4 py-10 text-center text-sm text-slate-500">
                      No hay colaboradores activos con los filtros actuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-6 pb-6">
            <div className="mb-4 mt-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Desactivados</h2>
              <span className="text-sm text-slate-700">{inactiveVisibleMembers.length} visibles</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[1160px] w-full text-slate-800">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-800">
                  <tr>
                    {inactiveColumnOrder.map((column) => (
                      <th
                        key={`inactive-header-${column}`}
                        draggable
                        onMouseDown={() => setDraggingInactiveColumn(column)}
                        onMouseEnter={() => onMouseEnterInactiveColumn(column)}
                        onDragStart={(event) => {
                          setDraggingInactiveColumn(column);
                          event.dataTransfer.setData("text/plain", column);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          onDropInactiveColumn(column, event.dataTransfer.getData("text/plain"));
                        }}
                        onDragEnd={() => setDraggingInactiveColumn(null)}
                        className={`px-4 py-3 select-none ${getInactiveHeaderWidthClass(column)} ${draggingInactiveColumn === column ? "opacity-60" : ""}`}
                        title="Arrastra para mover columna"
                      >
                        <span className="whitespace-nowrap">{INACTIVE_COLUMN_LABEL[column]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inactiveVisibleMembers.map((member) => (
                    <tr key={member.id} className="border-b border-slate-100 bg-slate-50/60 text-slate-800">
                      {inactiveColumnOrder.map((column) => (
                        <Fragment key={`inactive-cell-${member.id}-${column}`}>
                          {renderInactiveCell(member, column)}
                        </Fragment>
                      ))}
                    </tr>
                  ))}

                  {inactiveVisibleMembers.length === 0 ? (
                    <tr>
                      <td colSpan={inactiveColumnOrder.length} className="px-4 py-8 text-center text-sm text-slate-500">
                        No hay colaboradores desactivados con los filtros actuales.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

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

        {showEditor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white text-slate-800 shadow-xl">
              <div className="border-b p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">{editingId === null ? "Agregar colaborador" : "Editar colaborador"}</h2>
                  <button
                    type="button"
                    onClick={() => setShowEditor(false)}
                    className="text-xl text-slate-400 hover:text-slate-700"
                    aria-label="Cerrar"
                  >
                    x
                  </button>
                </div>
              </div>

              <div className="space-y-6 p-6">
                {formError ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {formError}
                  </div>
                ) : null}

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Información laboral</h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-800">Nombre</label>
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Puesto</label>
                      <input
                        type="text"
                        value={draft.role}
                        onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                      <p className="mt-1 text-xs text-slate-500">Cargo que desempeña dentro de la empresa.</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Area</label>
                      <input
                        type="text"
                        value={draft.area}
                        onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                      <p className="mt-1 text-xs text-slate-500">Departamento al que pertenece.</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Acceso</label>
                      <select
                        value={draft.access}
                        onChange={(event) => {
                          const normalized = normalizeSystemAccessRole(event.target.value) ?? DEFAULT_SYSTEM_ACCESS_ROLE;
                          setDraft((current) => ({ ...current, access: normalized }));
                        }}
                        className="w-full rounded-xl border px-4 py-2"
                      >
                        {SYSTEM_ACCESS_ROLES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Nivel de acceso dentro de Cincel.</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Capacidad</label>
                      <input
                        type="number"
                        min={1}
                        value={draft.capacity}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          setDraft((current) => ({ ...current, capacity: Number.isNaN(parsed) ? 1 : parsed }));
                        }}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Disponibilidad</label>
                      <select
                        value={draft.availability}
                        onChange={(event) => {
                          const selected = event.target.value;

                          if (selected === "Otros...") {
                            const customAvailability = window.prompt("Nueva disponibilidad", "");
                            const trimmed = customAvailability?.trim();

                            if (trimmed) {
                              setDraft((current) => ({ ...current, availability: trimmed }));
                            }

                            return;
                          }

                          setDraft((current) => ({ ...current, availability: selected as TeamAvailability }));
                        }}
                        className="w-full rounded-xl border px-4 py-2"
                      >
                        {availabilityOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                        <option value="Otros...">Otros...</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Acceso al sistema</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Administra aquí el acceso, la contraseña temporal y el historial de uso del colaborador.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge
                        label={accessPreviewState.status}
                        color={accessPreviewState.status === "Acceso activo"
                          ? "blue"
                          : accessPreviewState.status === "Pendiente de primer acceso"
                            ? "yellow"
                            : accessPreviewState.status === "Sin contraseña temporal"
                              ? "red"
                              : "gray"}
                      />
                      <Badge
                        label={accessPreviewState.hasSystemAccess ? "Tiene acceso al sistema" : "Sin acceso al sistema"}
                        color={accessPreviewState.hasSystemAccess ? "blue" : "gray"}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <label className="flex items-center justify-between gap-4">
                        <div>
                          <span className="block text-sm font-medium text-slate-800">Tiene acceso al sistema</span>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            Si lo activas, el colaborador podrá iniciar sesión y ver el ERP según su acceso.
                          </p>
                        </div>

                        <input
                          type="checkbox"
                          checked={draft.systemAccessEnabled}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              systemAccessEnabled: event.target.checked,
                              temporaryPassword: event.target.checked ? current.temporaryPassword : "",
                              temporaryPasswordConfirmation: event.target.checked ? current.temporaryPasswordConfirmation : "",
                            }))
                          }
                          className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                        />
                      </label>
                    </div>

                    {draft.systemAccessEnabled ? (
                      <>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-800">Contraseña temporal</label>
                          <input
                            type="password"
                            value={draft.temporaryPassword}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, temporaryPassword: event.target.value }))
                            }
                            placeholder={editingId === null ? "Asignar contraseña temporal" : "Solo si vas a restablecer"}
                            className="w-full rounded-xl border px-4 py-2"
                          />
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {editingId === null
                              ? "Obligatoria al crear una cuenta con acceso al sistema."
                              : "Rellena este campo solo si vas a restablecer la contraseña."}
                          </p>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-800">Confirmar contraseña temporal</label>
                          <input
                            type="password"
                            value={draft.temporaryPasswordConfirmation}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, temporaryPasswordConfirmation: event.target.value }))
                            }
                            placeholder="Repetir contraseña temporal"
                            className="w-full rounded-xl border px-4 py-2"
                          />
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">Debe coincidir con la contraseña temporal.</p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-slate-800">Último acceso</p>
                          <p className="mt-1 text-sm text-slate-600">{formatDateTime(accessPreviewState.lastLoginAt)}</p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-slate-800">Último cambio de contraseña</p>
                          <p className="mt-1 text-sm text-slate-600">{formatDateTime(accessPreviewState.passwordUpdatedAt)}</p>
                        </div>
                      </>
                    ) : (
                      <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
                        Este colaborador no tendrá acceso al sistema ni podrá iniciar sesión. Podrá seguir asignado a proyectos,
                        tareas y recursos.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Información personal</h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Fecha nacimiento</label>
                      <input
                        type="date"
                        value={draft.birthDate}
                        onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Nacionalidad</label>
                      <input
                        type="text"
                        value={draft.nationality}
                        onChange={(event) => setDraft((current) => ({ ...current, nationality: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Estado civil</label>
                      <input
                        type="text"
                        value={draft.maritalStatus}
                        onChange={(event) => setDraft((current) => ({ ...current, maritalStatus: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">CURP</label>
                      <input
                        type="text"
                        value={draft.curp}
                        onChange={(event) => setDraft((current) => ({ ...current, curp: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">RFC</label>
                      <input
                        type="text"
                        value={draft.rfc}
                        onChange={(event) => setDraft((current) => ({ ...current, rfc: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Contacto</h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Celular</label>
                      <input
                        type="text"
                        value={draft.phone}
                        onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Correo institucional</label>
                      <input
                        type="email"
                        value={draft.institutionalEmail}
                        onChange={(event) => setDraft((current) => ({ ...current, institutionalEmail: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-800">Direccion</label>
                      <input
                        type="text"
                        value={draft.address}
                        onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Telefono de casa</label>
                      <input
                        type="text"
                        value={draft.homePhone}
                        onChange={(event) => setDraft((current) => ({ ...current, homePhone: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Correo electronico personal</label>
                      <input
                        type="email"
                        value={draft.personalEmail}
                        onChange={(event) => setDraft((current) => ({ ...current, personalEmail: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Contacto de emergencia</h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Nombre</label>
                      <input
                        type="text"
                        value={draft.emergencyContactName}
                        onChange={(event) => setDraft((current) => ({ ...current, emergencyContactName: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Relacion</label>
                      <input
                        type="text"
                        value={draft.emergencyContactRelation}
                        onChange={(event) => setDraft((current) => ({ ...current, emergencyContactRelation: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Telefono</label>
                      <input
                        type="text"
                        value={draft.emergencyContactPhone}
                        onChange={(event) => setDraft((current) => ({ ...current, emergencyContactPhone: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-800">Direccion</label>
                      <input
                        type="text"
                        value={draft.emergencyContactAddress}
                        onChange={(event) => setDraft((current) => ({ ...current, emergencyContactAddress: event.target.value }))}
                        className="w-full rounded-xl border px-4 py-2"
                      />
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex justify-end gap-3 border-t p-6">
                <button
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setShowEditor(false);
                  }}
                  className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveMember}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {selectedCoordinatorMember ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
              <div className="border-b p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Proyectos como Encargado</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedCoordinatorMemberId(null)}
                    className="text-xl text-slate-400 hover:text-slate-700"
                    aria-label="Cerrar"
                  >
                    x
                  </button>
                </div>
                <p className="mt-1 text-sm text-slate-600">{selectedCoordinatorMember.name}</p>
              </div>

              <div className="space-y-3 p-6">
                {selectedCoordinatorMember.coordinatorProjects.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay proyectos asignados como encargado.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedCoordinatorMember.coordinatorProjects.map((project) => (
                      <span
                        key={`coordinator-project-${selectedCoordinatorMember.id}-${project}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700"
                      >
                        {project}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {selectedProfileMember ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
              <div className="border-b p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Ficha personal</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedProfileMemberId(null)}
                    className="text-xl text-slate-400 hover:text-slate-700"
                    aria-label="Cerrar"
                  >
                    x
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="flex items-center justify-between gap-4">
                  <Avatar name={selectedProfileMember.name} />
                  <Badge label={selectedProfileMember.active ? "Activo" : "Desactivado"} color={selectedProfileMember.active ? "blue" : "gray"} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm text-slate-800">
                  <p><span className="font-medium">Fecha nacimiento:</span> {selectedProfileMember.birthDate || "-"}</p>
                  <p><span className="font-medium">Nacionalidad:</span> {selectedProfileMember.nationality || "-"}</p>
                  <p><span className="font-medium">Celular:</span> {selectedProfileMember.phone || "-"}</p>
                  <p><span className="font-medium">Correo institucional:</span> {selectedProfileMember.institutionalEmail || "-"}</p>
                  <p><span className="font-medium">Direccion:</span> {selectedProfileMember.address || "-"}</p>
                  <p><span className="font-medium">Estado civil:</span> {selectedProfileMember.maritalStatus || "-"}</p>
                  <p><span className="font-medium">Telefono de casa:</span> {selectedProfileMember.homePhone || "-"}</p>
                  <p><span className="font-medium">Correo personal:</span> {selectedProfileMember.personalEmail || "-"}</p>
                  <p><span className="font-medium">CURP:</span> {selectedProfileMember.curp || "-"}</p>
                  <p><span className="font-medium">RFC:</span> {selectedProfileMember.rfc || "-"}</p>
                  <p><span className="font-medium">Puesto:</span> {selectedProfileMember.role}</p>
                  <p><span className="font-medium">Area:</span> {selectedProfileMember.area}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
                  <p className="font-medium">Contacto de emergencia</p>
                  <p className="mt-1"><span className="font-medium">Nombre:</span> {selectedProfileMember.emergencyContact.name || "-"}</p>
                  <p className="mt-1"><span className="font-medium">Relacion:</span> {selectedProfileMember.emergencyContact.relation || "-"}</p>
                  <p className="mt-1"><span className="font-medium">Telefono:</span> {selectedProfileMember.emergencyContact.phone || "-"}</p>
                  <p className="mt-1"><span className="font-medium">Direccion:</span> {selectedProfileMember.emergencyContact.address || "-"}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                  <p className="font-medium">Carga actual</p>
                  <p className="mt-1">Asignadas: {selectedProfileMember.assigned} | Soporte: {selectedProfileMember.support} | Total: {selectedProfileMember.total}</p>
                  <p className="mt-1">Ocupacion: {selectedProfileMember.occupancy}%</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}