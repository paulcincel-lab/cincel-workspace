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
      ],
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
      emails: [],
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

    drive: {
      administrativo: "https://drive.google.com/drive/folders/pla-internos",
      planos: "",
      renders: "",
      reportes: "https://drive.google.com/drive/folders/pla-cliente",
    },
  },
];