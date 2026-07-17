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

    team: [
      "Juanma",
      "Aaron",
      "Alejandro",
    ],

    progress: 92,

    drive: {
      administrativo: "",
      planos: "",
      renders: "",
      reportes: "",
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

    team: [
      "Rafa",
      "Gabriel",
    ],

    progress: 38,

    drive: {
      administrativo: "",
      planos: "",
      renders: "",
      reportes: "",
    },
  },
];