import type { TeamAvailability } from "@/lib/data/team";
import type { SystemAccessRole } from "@/lib/data/roles";
import type { Staff } from "@/lib/types/core";

export type MemberDraft = {
  name: string;
  lastName: string;
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
  /** `core.areas` ids this collaborator belongs to — a staff member can be in several. */
  areaIds: string[];
  capacity: number;
  availability: TeamAvailability;
};

/**
 * `Staff` plus the workload figures computed client-side from live tasks and
 * projects. PII (CURP, RFC, address, home phone, personal email, emergency
 * contact, birth date, marital status, nationality) is NOT part of this —
 * it never ships in a bulk list, only through the authenticated
 * `/api/team/sensitive/[id]` route when a profile is actually opened (see
 * that route's own doc comment).
 */
export type TeamMemberWithWorkload = Staff & {
  institutionalEmail: string;
  /** Names of the `core.areas` this collaborator belongs to (many-to-many). */
  areas: string[];
  assigned: number;
  support: number;
  total: number;
  projects: string[];
  coordinatorProjects: string[];
  coordinatorProjectsCount: number;
  occupancy: number;
  loadLabel: string;
};

export type AccessPreviewState = {
  hasSystemAccess: boolean;
  status: string;
  hasPasswordHash: boolean;
  authEnabled: boolean;
  mustChangePassword: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
};

/** PII fetched on demand from /api/team/sensitive/[id] when a profile opens. */
export type StaffSensitiveInfo = {
  curp: string;
  rfc: string;
  address: string;
  home_phone: string;
  personal_email: string;
  emergency_contact: { name: string; relation: string; phone: string; address: string } | null;
  birth_date: string;
  marital_status: string;
  nationality: string;
};
