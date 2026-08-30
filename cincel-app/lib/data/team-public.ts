/**
 * Client-safe team member data.
 *
 * This module intentionally omits all personally identifiable information (PII):
 * CURP, RFC, home address, home phone, personal email, emergency contact,
 * birth date, marital status, and nationality.
 *
 * Client components MUST import from this module, not from lib/data/team.ts.
 * PII fields are served exclusively via the authenticated Route Handler at
 * /api/team/sensitive/[id] (see app/api/team/sensitive/[id]/route.ts).
 */

import type { TeamMemberAuthStatus } from "@/lib/data/team";

export type TeamMemberPublic = {
  id: number;
  name: string;
  role: string;
  area: string;
  capacity: number;
  availability: string;
  active: boolean;
  institutionalEmail: string;
  phone: string;
  authStatus?: TeamMemberAuthStatus;
};

export const teamMembersPublic: TeamMemberPublic[] = [
  {
    id: 1,
    name: "Juanma",
    role: "Director de Proyecto",
    area: "Direccion",
    capacity: 10,
    availability: "Mixto",
    active: true,
    institutionalEmail: "juanma@cincel.mx",
    phone: "+52 646 111 2233",
  },
  {
    id: 2,
    name: "Paul",
    // TEMPORARY test-only account: Administrador access for manual/QA testing.
    // Remove this override once real Supabase Auth + role management is in place.
    role: "Administrador",
    area: "Presale",
    capacity: 8,
    availability: "Disponible",
    active: true,
    institutionalEmail: "paul@cincel.mx",
    phone: "+52 646 222 3344",
  },
  {
    id: 3,
    name: "Rafa",
    role: "Arquitecto Senior",
    area: "Diseño",
    capacity: 9,
    availability: "Medio Tiempo",
    active: true,
    institutionalEmail: "rafa@cincel.mx",
    phone: "+52 646 333 4455",
  },
  {
    id: 4,
    name: "Aaron",
    role: "Arquitecto",
    area: "Diseño",
    capacity: 8,
    availability: "Disponible",
    active: true,
    institutionalEmail: "aaron@cincel.mx",
    phone: "+52 646 444 5566",
  },
  {
    id: 5,
    name: "Gabriel",
    role: "Coordinador de Obra",
    area: "Construcción",
    capacity: 9,
    availability: "Mixto",
    active: true,
    institutionalEmail: "gabriel@cincel.mx",
    phone: "+52 646 555 6677",
  },
  {
    id: 6,
    name: "Alejandro",
    role: "Especialista Tecnico",
    area: "Ejecutivo",
    capacity: 7,
    availability: "Mixto",
    active: true,
    institutionalEmail: "alejandro@cincel.mx",
    phone: "+52 646 666 7788",
  },
  {
    id: 7,
    name: "Rodrigo",
    role: "Residente de Obra",
    area: "Construcción",
    capacity: 8,
    availability: "Disponible",
    active: true,
    institutionalEmail: "rodrigo@cincel.mx",
    phone: "+52 646 777 8899",
  },
];
