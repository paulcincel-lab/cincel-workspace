import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchBoardAction } from "@/lib/actions/tasks-actions";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import type { TaskListItem, TaskStatus, TaskStatusOption, WorkflowDetail } from "@/lib/types/core";
import { TableroClient } from "./TableroClient";

const EMPTY_BOARD: Record<TaskStatus, TaskListItem[]> = {
  pendiente: [],
  en_proceso: [],
  completado: [],
  bloqueado: [],
};

export default async function TableroPage() {
  let initialBoard: Record<TaskStatus, TaskListItem[]> = EMPTY_BOARD;
  let workflows: WorkflowDetail[] = [];
  let customStatuses: TaskStatusOption[] = [];

  try {
    [initialBoard, workflows, customStatuses] = await Promise.all([
      fetchBoardAction(),
      fetchWorkflowsAction(),
      fetchTaskStatusesAction(),
    ]);
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <TableroClient initialBoard={initialBoard} customStatuses={customStatuses} workflows={workflows} />
      </section>
    </main>
  );
}
