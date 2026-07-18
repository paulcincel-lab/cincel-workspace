export const projects = [
  {
    id: 1,
    code: "ENS-001",

    name: "Ensenada",

    active: true,

    status: "Activo",

    client: {
      id: 1,
      name: "Familia Gómez",
      emails: [
        "cliente@email.com",
        "familia.gomez@correo.mx",
      ],
      phone: "+52 646 555 0101",
      kind: "Particular",
      contacts: [
        {
          name: "Luis Gomez",
          role: "Titular",
          phone: "+52 646 555 0101",
          email: "luis.gomez@email.com",
        },
        {
          name: "Mariana Gomez",
          role: "Pareja",
          phone: "+52 646 555 0102",
          email: "mariana.gomez@email.com",
        },
      ],
      completedProjects: [
        "Casa Valle",
        "Remodelacion Gomez",
      ],
      acquisitionChannel: "Recomendacion",
      totalSpent: 1850000,
    },

    type: "Habitacional",

    stage: "Diseño",

    phase: "Proyecto Ejecutivo",

    address: {
      street: "Av. del Mar",
      city: "Ensenada",
      state: "Baja California",
    },

    manager: "Juanma",

    coordinator: "Aaron",

    team: [
      "Juanma",
      "Aaron",
      "Alejandro",
    ],

    progress: 92,

    startDate: "2025-02-14",

    drive: {
      administrativo: "https://drive.google.com/drive/folders/ens-internos",
      planos: "",
      renders: "",
      reportes: "https://drive.google.com/drive/folders/ens-cliente",
    },
  },

  {
    id: 2,
    code: "PLA-001",

    name: "Platzi",

    active: true,

    status: "Activo",

    client: {
      id: 2,
      name: "Platzi",
      emails: [
        "proyectos@platzi.com",
        "direccion@platzi.com",
      ],
      phone: "+52 55 7000 2200",
      kind: "Empresa",
      contacts: [
        {
          name: "Maria Alvarez",
          role: "Directora de Operaciones",
          phone: "+52 55 7000 2201",
          email: "maria.alvarez@platzi.com",
        },
        {
          name: "Carlos Ruiz",
          role: "Gerente de Proyecto",
          phone: "+52 55 7000 2202",
          email: "carlos.ruiz@platzi.com",
        },
      ],
      completedProjects: [
        "Campus Norte",
        "Aulas Creativas",
        "Oficinas Torre C",
      ],
      acquisitionChannel: "Pagina web",
      totalSpent: 4200000,
    },

    type: "Oficinas",

    stage: "Construcción",

    phase: "Construcción",

    address: {
      street: "",
      city: "CDMX",
      state: "CDMX",
    },

    manager: "Rafa",

    coordinator: "Gabriel",

    team: [
      "Rafa",
      "Gabriel",
    ],

    progress: 38,

    startDate: "2024-11-05",

    drive: {
      administrativo: "https://drive.google.com/drive/folders/pla-internos",
      planos: "",
      renders: "",
      reportes: "https://drive.google.com/drive/folders/pla-cliente",
    },
  },
];