/**
 * Fixture for `EsencialCard` / `EsencialItemRow` (frame `Lista-Esencial`):
 * cards per project with the signed-in user's tasks.
 */
import type { EsencialItemRowProps } from "@/components/widgets/EsencialItemRow";
import { tramoDot } from "@/components/widgets/esencial-tokens";
import { STATUS_FIXTURE, TRAMO_FIXTURE } from "@/components/widgets/fixtures/status-adapters";
import type { WorkflowRef } from "@/lib/types/core";
import type { TaskStatusRef } from "@/lib/types/redesign";

export type EsencialCardFixture = {
  id: string;
  title: string;
  href: string;
  taskCount: number;
  overdueCount: number;
  rows: (EsencialItemRowProps & { id: string })[];
  completed: (EsencialItemRowProps & { id: string })[];
};

function row(
  id: string,
  title: string,
  tramo: WorkflowRef,
  date: string,
  status: TaskStatusRef,
  overdue = false,
): EsencialItemRowProps & { id: string } {
  return {
    id,
    title,
    href: `/tareas/${id}`,
    meta: [
      { key: "tramo", label: tramo.name, dot: tramoDot(tramo) },
      { key: "date", label: date, mono: true, tone: overdue ? "destructive" : "muted" },
    ],
    status: { kind: "task", value: status },
  };
}

export const esencialCardsFixture: EsencialCardFixture[] = [
  {
    id: "p-polanco",
    title: "Oficina Polanco",
    href: "/proyectos/p-polanco",
    taskCount: 3,
    overdueCount: 1,
    rows: [
      row("t-1", "Revisión de planos eléctricos con Ana", TRAMO_FIXTURE.diseno, "5 nov", STATUS_FIXTURE.enProceso, true),
      row("t-2", "Aprobar cotización de cancelería", TRAMO_FIXTURE.presale, "12 nov", STATUS_FIXTURE.pendiente),
      row("t-3", "Visita de obra semanal", TRAMO_FIXTURE.construccion, "13 nov", STATUS_FIXTURE.pendiente),
    ],
    completed: [row("t-4", "Levantamiento del sitio", TRAMO_FIXTURE.presale, "2 nov", STATUS_FIXTURE.completado)],
  },
  {
    id: "p-roma",
    title: "Depto Roma Norte",
    href: "/proyectos/p-roma",
    taskCount: 2,
    overdueCount: 1,
    rows: [
      row("t-5", "Validar plano de cocina integral", TRAMO_FIXTURE.diseno, "6 nov", STATUS_FIXTURE.pendiente, true),
      row("t-6", "Firmar orden de cambio de tablaroca", TRAMO_FIXTURE.construccion, "18 nov", STATUS_FIXTURE.bloqueado),
    ],
    completed: [],
  },
  {
    id: "p-madrid",
    title: "Casa Madrid 22",
    href: "/proyectos/p-madrid",
    taskCount: 3,
    overdueCount: 0,
    rows: [
      row("t-7", "Revisar presupuesto de acabados", TRAMO_FIXTURE.presale, "12 nov", STATUS_FIXTURE.enProceso),
      row("t-8", "Elegir muestras de piso con el cliente", TRAMO_FIXTURE.decoracion, "15 nov", STATUS_FIXTURE.pendiente),
      row("t-9", "Revisión estructural de cimentación", TRAMO_FIXTURE.construccion, "20 nov", STATUS_FIXTURE.enProceso),
    ],
    completed: [row("t-10", "Contrato firmado", TRAMO_FIXTURE.presale, "1 nov", STATUS_FIXTURE.completado)],
  },
  {
    id: "p-valle",
    title: "Casa Valle de Bravo",
    href: "/proyectos/p-valle",
    taskCount: 2,
    overdueCount: 0,
    rows: [
      row("t-11", "Propuesta de anteproyecto", TRAMO_FIXTURE.diseno, "19 nov", STATUS_FIXTURE.enProceso),
      row("t-12", "Reunión de arranque con el cliente", TRAMO_FIXTURE.presale, "24 nov", STATUS_FIXTURE.pendiente),
    ],
    completed: [],
  },
];
