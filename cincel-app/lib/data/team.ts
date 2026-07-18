export type TeamAvailability =
  | "Disponible"
  | "En campo"
  | "Foco"
  | "No disponible";

export type TeamMember = {
  id: number;
  name: string;
  role: string;
  area: string;
  capacity: number;
  availability: TeamAvailability;
  active: boolean;
};

export const teamMembers: TeamMember[] = [
  {
    id: 1,
    name: "Juanma",
    role: "Director de Proyecto",
    area: "Direccion",
    capacity: 10,
    availability: "Foco",
    active: true,
  },
  {
    id: 2,
    name: "Paul",
    role: "Lider Comercial",
    area: "Presale",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
  {
    id: 3,
    name: "Rafa",
    role: "Arquitecto Senior",
    area: "Diseño",
    capacity: 9,
    availability: "En campo",
    active: true,
  },
  {
    id: 4,
    name: "Aaron",
    role: "Arquitecto",
    area: "Diseño",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
  {
    id: 5,
    name: "Gabriel",
    role: "Coordinador de Obra",
    area: "Construcción",
    capacity: 9,
    availability: "En campo",
    active: true,
  },
  {
    id: 6,
    name: "Alejandro",
    role: "Especialista Tecnico",
    area: "Ejecutivo",
    capacity: 7,
    availability: "Foco",
    active: true,
  },
  {
    id: 7,
    name: "Rodrigo",
    role: "Residente de Obra",
    area: "Construcción",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
];
