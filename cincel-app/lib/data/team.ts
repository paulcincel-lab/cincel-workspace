/**
 * Full TeamMember type used by the repository layer and server-side code.
 *
 * IMPORTANT: The static mock array (teamMembers) intentionally has empty strings
 * for all PII fields (CURP, RFC, address, home phone, personal email, emergency
 * contact). In production these fields are populated from the Supabase database
 * and served only through authenticated server-side endpoints.
 *
 * Client components must import from lib/data/team-public.ts instead.
 */

export type TeamAvailability = string;

/**
 * PII-free credential status, derived server-side from `core.auth_credentials`.
 * Never carries a password hash — see `setTeamMemberCredentialAction` in
 * `lib/actions/team-actions.ts` for the write path.
 */
export type TeamMemberAuthStatus = {
  authEnabled: boolean;
  hasPasswordHash: boolean;
  mustChangePassword: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
};

export type TeamMember = {
  id: number;
  name: string;
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
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
    address: string;
  };
  role: string;
  area: string;
  capacity: number;
  availability: TeamAvailability;
  active: boolean;
  authStatus?: TeamMemberAuthStatus;
};

const EMPTY_EMERGENCY_CONTACT = { name: "", relation: "", phone: "", address: "" };

export const teamMembers: TeamMember[] = [
  {
    id: 1,
    name: "Juanma",
    birthDate: "",
    nationality: "",
    phone: "+52 646 111 2233",
    institutionalEmail: "juanma@cincel.mx",
    address: "",
    maritalStatus: "",
    homePhone: "",
    personalEmail: "",
    curp: "",
    rfc: "",
    emergencyContact: EMPTY_EMERGENCY_CONTACT,
    role: "Director de Proyecto",
    area: "Direccion",
    capacity: 10,
    availability: "Mixto",
    active: true,
  },
  {
    id: 2,
    name: "Paul",
    birthDate: "",
    nationality: "",
    phone: "+52 646 222 3344",
    institutionalEmail: "paul@cincel.mx",
    address: "",
    maritalStatus: "",
    homePhone: "",
    personalEmail: "",
    curp: "",
    rfc: "",
    emergencyContact: EMPTY_EMERGENCY_CONTACT,
    role: "Lider Comercial",
    area: "Presale",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
  {
    id: 3,
    name: "Rafa",
    birthDate: "",
    nationality: "",
    phone: "+52 646 333 4455",
    institutionalEmail: "rafa@cincel.mx",
    address: "",
    maritalStatus: "",
    homePhone: "",
    personalEmail: "",
    curp: "",
    rfc: "",
    emergencyContact: EMPTY_EMERGENCY_CONTACT,
    role: "Arquitecto Senior",
    area: "Diseño",
    capacity: 9,
    availability: "Medio Tiempo",
    active: true,
  },
  {
    id: 4,
    name: "Aaron",
    birthDate: "",
    nationality: "",
    phone: "+52 646 444 5566",
    institutionalEmail: "aaron@cincel.mx",
    address: "",
    maritalStatus: "",
    homePhone: "",
    personalEmail: "",
    curp: "",
    rfc: "",
    emergencyContact: EMPTY_EMERGENCY_CONTACT,
    role: "Arquitecto",
    area: "Diseño",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
  {
    id: 5,
    name: "Gabriel",
    birthDate: "",
    nationality: "",
    phone: "+52 646 555 6677",
    institutionalEmail: "gabriel@cincel.mx",
    address: "",
    maritalStatus: "",
    homePhone: "",
    personalEmail: "",
    curp: "",
    rfc: "",
    emergencyContact: EMPTY_EMERGENCY_CONTACT,
    role: "Coordinador de Obra",
    area: "Construcción",
    capacity: 9,
    availability: "Mixto",
    active: true,
  },
  {
    id: 6,
    name: "Alejandro",
    birthDate: "",
    nationality: "",
    phone: "+52 646 666 7788",
    institutionalEmail: "alejandro@cincel.mx",
    address: "",
    maritalStatus: "",
    homePhone: "",
    personalEmail: "",
    curp: "",
    rfc: "",
    emergencyContact: EMPTY_EMERGENCY_CONTACT,
    role: "Especialista Tecnico",
    area: "Ejecutivo",
    capacity: 7,
    availability: "Mixto",
    active: true,
  },
  {
    id: 7,
    name: "Rodrigo",
    birthDate: "",
    nationality: "",
    phone: "+52 646 777 8899",
    institutionalEmail: "rodrigo@cincel.mx",
    address: "",
    maritalStatus: "",
    homePhone: "",
    personalEmail: "",
    curp: "",
    rfc: "",
    emergencyContact: EMPTY_EMERGENCY_CONTACT,
    role: "Residente de Obra",
    area: "Construcción",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
];
