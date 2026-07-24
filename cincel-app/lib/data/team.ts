export type TeamAvailability = string;

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
  auth?: {
    passwordHash: string;
    authEnabled: boolean;
    mustChangePassword?: boolean;
    passwordUpdatedAt: string | null;
    lastLoginAt: string | null;
  };
};

export const teamMembers: TeamMember[] = [
  {
    id: 1,
    name: "Juanma",
    birthDate: "1991-04-12",
    nationality: "Mexicana",
    phone: "+52 646 111 2233",
    institutionalEmail: "juanma@cincel.mx",
    address: "Ensenada, Baja California",
    maritalStatus: "Casado",
    homePhone: "+52 646 801 1001",
    personalEmail: "juanma.personal@gmail.com",
    curp: "JUAM910412HBCNXR09",
    rfc: "JUAM9104129A1",
    emergencyContact: {
      name: "Laura Mendez",
      relation: "Esposa",
      phone: "+52 646 801 2001",
      address: "Ensenada, Baja California",
    },
    role: "Director de Proyecto",
    area: "Direccion",
    capacity: 10,
    availability: "Mixto",
    active: true,
  },
  {
    id: 2,
    name: "Paul",
    birthDate: "1993-09-03",
    nationality: "Mexicana",
    phone: "+52 646 222 3344",
    institutionalEmail: "paul@cincel.mx",
    address: "Ensenada, Baja California",
    maritalStatus: "Soltero",
    homePhone: "+52 646 801 1002",
    personalEmail: "paul.personal@gmail.com",
    curp: "PAUL930903HBCNXL02",
    rfc: "PAUL9309037B2",
    emergencyContact: {
      name: "Ana Ruiz",
      relation: "Hermana",
      phone: "+52 646 801 2002",
      address: "Ensenada, Baja California",
    },
    role: "Lider Comercial",
    area: "Presale",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
  {
    id: 3,
    name: "Rafa",
    birthDate: "1989-01-25",
    nationality: "Mexicana",
    phone: "+52 646 333 4455",
    institutionalEmail: "rafa@cincel.mx",
    address: "Tijuana, Baja California",
    maritalStatus: "Casado",
    homePhone: "+52 664 801 1003",
    personalEmail: "rafa.personal@gmail.com",
    curp: "RAFA890125HBCNXR08",
    rfc: "RAFA8901254K3",
    emergencyContact: {
      name: "Mariana Lopez",
      relation: "Esposa",
      phone: "+52 664 801 2003",
      address: "Tijuana, Baja California",
    },
    role: "Arquitecto Senior",
    area: "Diseño",
    capacity: 9,
    availability: "Medio Tiempo",
    active: true,
  },
  {
    id: 4,
    name: "Aaron",
    birthDate: "1995-07-15",
    nationality: "Mexicana",
    phone: "+52 646 444 5566",
    institutionalEmail: "aaron@cincel.mx",
    address: "Mexicali, Baja California",
    maritalStatus: "Soltero",
    homePhone: "+52 686 801 1004",
    personalEmail: "aaron.personal@gmail.com",
    curp: "AARO950715HBCNXR06",
    rfc: "AARO9507152L4",
    emergencyContact: {
      name: "Carlos Perez",
      relation: "Padre",
      phone: "+52 686 801 2004",
      address: "Mexicali, Baja California",
    },
    role: "Arquitecto",
    area: "Diseño",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
  {
    id: 5,
    name: "Gabriel",
    birthDate: "1990-11-08",
    nationality: "Mexicana",
    phone: "+52 646 555 6677",
    institutionalEmail: "gabriel@cincel.mx",
    address: "Rosarito, Baja California",
    maritalStatus: "Casado",
    homePhone: "+52 661 801 1005",
    personalEmail: "gabriel.personal@gmail.com",
    curp: "GABR901108HBCNXR05",
    rfc: "GABR9011088M5",
    emergencyContact: {
      name: "Sofia Ramos",
      relation: "Esposa",
      phone: "+52 661 801 2005",
      address: "Rosarito, Baja California",
    },
    role: "Coordinador de Obra",
    area: "Construcción",
    capacity: 9,
    availability: "Mixto",
    active: true,
  },
  {
    id: 6,
    name: "Alejandro",
    birthDate: "1992-06-19",
    nationality: "Mexicana",
    phone: "+52 646 666 7788",
    institutionalEmail: "alejandro@cincel.mx",
    address: "Tijuana, Baja California",
    maritalStatus: "Soltero",
    homePhone: "+52 664 801 1006",
    personalEmail: "alejandro.personal@gmail.com",
    curp: "ALEJ920619HBCNXR04",
    rfc: "ALEJ9206195N6",
    emergencyContact: {
      name: "Lucia Torres",
      relation: "Madre",
      phone: "+52 664 801 2006",
      address: "Tijuana, Baja California",
    },
    role: "Especialista Tecnico",
    area: "Ejecutivo",
    capacity: 7,
    availability: "Mixto",
    active: true,
  },
  {
    id: 7,
    name: "Rodrigo",
    birthDate: "1994-03-27",
    nationality: "Mexicana",
    phone: "+52 646 777 8899",
    institutionalEmail: "rodrigo@cincel.mx",
    address: "Ensenada, Baja California",
    maritalStatus: "Soltero",
    homePhone: "+52 646 801 1007",
    personalEmail: "rodrigo.personal@gmail.com",
    curp: "RODR940327HBCNXR03",
    rfc: "RODR9403271P7",
    emergencyContact: {
      name: "Miguel Ortega",
      relation: "Hermano",
      phone: "+52 646 801 2007",
      address: "Ensenada, Baja California",
    },
    role: "Residente de Obra",
    area: "Construcción",
    capacity: 8,
    availability: "Disponible",
    active: true,
  },
];
