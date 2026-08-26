import type { TeamAvailability, TeamMember } from "@/lib/data/team";
import type { SystemAccessRole } from "@/lib/data/roles";

export type MemberDraft = {
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

export type TeamMemberWithWorkload = TeamMember & {
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

export type AccessPreviewState = {
  hasSystemAccess: boolean;
  status: string;
  hasPasswordHash: boolean;
  authEnabled: boolean;
  mustChangePassword: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
};
