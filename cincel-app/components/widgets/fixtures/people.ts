/**
 * Shared fixture for `PeopleWidget` (redesign FE §4.10.1, canvas frames
 * `Personas`, `PersonasEsencial`, `PersonasAnalitico`): the same team renders
 * in Visual, Esencial and Analítico.
 */
import type { PersonDatum } from "@/lib/types/widgets";

export const PEOPLE_FIXTURE: PersonDatum[] = [
  {
    id: "p-paul",
    name: "Paul Langarica Soubic",
    initials: "PL",
    photoUrl: null,
    puesto: "Residente de obra",
    tramo: "construccion",
    open: 18,
    overdue: 6,
    activeProjects: 3,
    occupancyPct: 100,
    weekHours: 41.5,
    availability: ["ocupado", "saturado", "saturado", "ocupado", "saturado"],
    href: "/personas/equipo/p-paul",
  },
  {
    id: "p-alejandro",
    name: "Alejandro Riofrio",
    initials: "AR",
    photoUrl: null,
    puesto: "Administrador · dirección",
    tramo: "presale",
    open: 12,
    overdue: 3,
    activeProjects: 4,
    occupancyPct: 67,
    weekHours: null,
    availability: ["ocupado", "ocupado", "libre", "ocupado", "ocupado"],
    href: "/personas/equipo/p-alejandro",
  },
  {
    id: "p-maria",
    name: "María González",
    initials: "MG",
    photoUrl: null,
    puesto: "Arquitecta de diseño",
    tramo: "diseno",
    open: 10,
    overdue: 1,
    activeProjects: 2,
    occupancyPct: 56,
    weekHours: 0,
    availability: ["libre", "ocupado", "ocupado", "libre", "libre"],
    href: "/personas/equipo/p-maria",
  },
  {
    id: "p-luis",
    name: "Luis Ramírez",
    initials: "LR",
    photoUrl: null,
    puesto: "Diseño de interiores",
    tramo: null,
    open: 6,
    overdue: 0,
    activeProjects: 2,
    occupancyPct: 33,
    weekHours: 16,
    availability: ["vacaciones", "vacaciones", "vacaciones", "libre", "ocupado"],
    href: "/personas/equipo/p-luis",
  },
  {
    id: "p-sofia",
    name: "Sofía Castro",
    initials: "SC",
    photoUrl: null,
    puesto: "Ventas y presupuestos",
    tramo: "presale",
    open: 5,
    overdue: 1,
    activeProjects: 2,
    occupancyPct: 28,
    weekHours: 40.2,
    availability: ["libre", "libre", "ocupado", "libre", "libre"],
    href: "/personas/equipo/p-sofia",
  },
];

/** Esencial availability sentence per fixture person. */
export const PEOPLE_AVAILABILITY_SENTENCES: Record<string, string> = {
  "p-paul": "Saturado mar, mié y vie.",
  "p-alejandro": "Libre el mié.",
  "p-maria": "Libre lun, jue y vie.",
  "p-luis": "Vacaciones lun–mié; libre el jue.",
  "p-sofia": "Libre lun, mar, jue y vie.",
};

/** Analítico averages row for `show = ["load", "hours", "projects"]`. */
export const PEOPLE_AVERAGES = {
  name: "Promedio · 5 personas",
  open: "10.2",
  overdue: "2.2",
  // Alejandro's hours are not returned (null), so the average is over four people.
  weekHours: "24.4",
  occupancyPct: "57%",
  activeProjects: "2.6",
};
