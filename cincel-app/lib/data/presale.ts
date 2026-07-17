import type { Task } from "@/lib/types/task";

export const presaleTasks: Task[] = [
  {
    id: 1,
    project: "Ensenada",
    workflow: "Presale",
    phase: "Presentación",

    description: "Preparar presentación inicial",

    notes: "Cliente interesado en iniciar obra en septiembre.",

    manager: "Juanma",

    support: ["Rafa"],

    status: "En proceso",

    priority: "Alta",

    commitmentDate: "2026-08-15",

    reviewDate: "2026-07-22",

    updatedAt: "Hoy",

    createdAt: "2026-07-10",

    history: [
      {
        id: 1,
        date: "2026-07-15",
        author: "Paul",
        comment: "Cliente solicitó ampliar la cocina.",
      },
    ],

    checklist: [
      {
        id: 1,
        title: "Levantamiento",
        completed: true,
      },
      {
        id: 2,
        title: "Concepto",
        completed: true,
      },
      {
        id: 3,
        title: "Presentación",
        completed: false,
      },
    ],
  },

  {
    id: 2,
    project: "Platzi",
    workflow: "Presale",
    phase: "Con Cliente",

    description: "Revisar propuesta económica",

    notes: "Esperando comentarios del cliente.",

    manager: "Paul",

    support: ["Juanma"],

    status: "Pendiente",

    priority: "Media",

    commitmentDate: "2026-08-01",

    reviewDate: "2026-07-23",

    updatedAt: "Ayer",

    createdAt: "2026-07-11",

    history: [],

    checklist: [],
  },

  {
    id: 3,
    project: "Río",
    workflow: "Presale",
    phase: "Cobro",

    description: "Enviar factura del anticipo",

    notes: "Pendiente de confirmación de pago.",

    manager: "Paul",

    support: [],

    status: "Pendiente",

    priority: "Alta",

    commitmentDate: "2026-07-30",

    reviewDate: "2026-07-21",

    updatedAt: "Hoy",

    createdAt: "2026-07-09",

    history: [],

    checklist: [],
  },  {
    id: 4,
    project: "Neo Gen",
    workflow: "Presale",
    phase: "Inicial",

    description: "Agendar reunión de arranque",

    notes: "Esperando confirmación de fecha.",

    manager: "Aaron",

    support: ["Paul"],

    status: "En proceso",

    priority: "Media",

    commitmentDate: "2026-08-05",

    reviewDate: "2026-07-24",

    updatedAt: "Hoy",

    createdAt: "2026-07-14",

    history: [],

    checklist: [],
  },

  {
    id: 5,
    project: "Muinura",
    workflow: "Presale",
    phase: "Minutas",

    description: "Enviar minuta de reunión",

    notes: "Incluir acuerdos sobre mobiliario.",

    manager: "Gabriel",

    support: ["Juanma"],

    status: "Pendiente",

    priority: "Baja",

    commitmentDate: "2026-07-28",

    reviewDate: "2026-07-21",

    updatedAt: "Hoy",

    createdAt: "2026-07-13",

    history: [],

    checklist: [],
  },

  {
    id: 6,
    project: "Cerro Grande",
    workflow: "Presale",
    phase: "Presentación",

    description: "Preparar propuesta arquitectónica",

    notes: "Cliente quiere dos opciones de fachada.",

    manager: "Rafa",

    support: ["Aaron"],

    status: "En proceso",

    priority: "Alta",

    commitmentDate: "2026-08-10",

    reviewDate: "2026-07-25",

    updatedAt: "Hoy",

    createdAt: "2026-07-12",

    history: [],

    checklist: [],
  },
];