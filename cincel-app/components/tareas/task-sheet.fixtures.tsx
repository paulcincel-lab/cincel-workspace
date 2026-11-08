/**
 * Test fixtures for `TaskSheet` (TaskSheet.test.tsx, TaskSheet.a11y.test.tsx).
 * Not a test file: plain data (a task and the `getTaskSheetData` payload the
 * tests seed the query cache with) plus a `FormSheet` test double that keeps
 * its contract (FE §4.11) so the sheet's own content is what the tests
 * exercise. It imports no query or action module, so `vi.mock` factories can
 * load it.
 */
import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { FormSheetProps } from "@/components/patterns/FormSheet";
import type { TaskDetail, WorkflowDetail } from "@/lib/types/core";
import type { TaskSheetData } from "@/lib/types/task-sheet";

export const DISENO_REF = { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 };

export const PHASES = [
  { id: "f-ante", name: "Anteproyecto", sortOrder: 1 },
  { id: "f-ejec", name: "Ejecutivo", sortOrder: 2 },
];

export const SPACES = [{ id: "e-201", name: "Depto 201", projectId: "p-1", sortOrder: 1, taskCount: 0 }];

export const STAFF = [
  { id: "s-1", name: "Ana López", active: true, suggested: true },
  { id: "s-2", name: "Andrés Núñez", active: true, suggested: false },
  { id: "s-3", name: "Paul Langarica", active: true, suggested: false },
];

/** A tramo with (or without) a fase catalog, as `fetchWorkflowsAction` returns it. */
export function makeWorkflow(phases = PHASES): WorkflowDetail {
  return {
    ...DISENO_REF,
    active: true,
    phases: phases.map((p) => ({ ...p, workflowId: DISENO_REF.id, active: true, templateCount: 0 })),
    templates: [],
  } as unknown as WorkflowDetail;
}

export function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: "t-1",
    projectId: "p-1",
    kind: "usuario",
    templateId: null,
    workflowId: DISENO_REF.id,
    phaseId: "f-ante",
    spaceId: null,
    closedAt: null,
    title: "Planos de conjunto",
    notes: "Revisar cotas con el cliente.",
    createdById: "s-9",
    managerId: "s-1",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: "2026-11-20",
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    customStatus: null,
    project: { id: "p-1", name: "Casa Lomas", clientName: null },
    workflow: DISENO_REF,
    phase: PHASES[0],
    space: null,
    manager: { id: "s-1", name: "Ana López" },
    support: [],
    checklist: { total: 2, completed: 1 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    createdBy: { id: "s-9", name: "Juanma" },
    checklistItems: [
      { id: "c-1", title: "Medir baños", completed: true, sortOrder: 1 },
      { id: "c-2", title: "Subir planos", completed: false, sortOrder: 2 },
    ],
    attachments: [
      {
        id: "a-1",
        taskId: "t-1",
        fileName: "Baño PB antes.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        uploadedBy: { id: "s-1", name: "Ana López" },
        checklistItemId: null,
        createdAt: "2026-11-01T09:00:00.000Z",
      },
    ],
    links: [],
    history: [
      {
        id: "h-1",
        entity: "task",
        entityId: "t-1",
        kind: "comentario",
        actor: { id: "s-9", name: "Juanma" },
        field: null,
        beforeValue: null,
        afterValue: null,
        comment: "@Ana López ojo con el modelo.",
        eventAt: "2026-11-01T10:00:00.000Z",
      },
    ],
    ...overrides,
  } as TaskDetail;
}

/** `catalog.assignableStaff`: `{id,name,suggested}` only. */
export const ASSIGNABLE = STAFF.map(({ id, name, suggested }) => ({ id, name, suggested }));

/** What `getTaskSheetData` returns for `task`: the catalogs it seeds (no espacios unless given). */
export function makeSheetData(task: TaskDetail = makeTask(), overrides: Partial<Omit<TaskSheetData, "task">> = {}): TaskSheetData {
  return {
    task,
    statuses: [],
    workflows: [DISENO_REF],
    assignable: ASSIGNABLE,
    spaces: [],
    phases: task.workflowId ? PHASES : [],
    ...overrides,
  };
}

/** `FormSheet` double: right `Sheet`, title, a `<form>` body, inline error and the "Cancelar" + submit footer. */
export function FormSheetDouble({
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  submitLabel,
  pending,
  error,
  children,
}: FormSheetProps): ReactNode {
  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          {children}
          {error ? <div role="alert">{error}</div> : null}
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button type="submit" disabled={pending}>
            {submitLabel}
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
