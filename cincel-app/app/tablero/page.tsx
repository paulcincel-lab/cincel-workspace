import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchBoardAction } from "@/lib/actions/tasks-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import type { TaskListItem, TaskStatus, WorkflowDetail } from "@/lib/types/core";
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

  try {
    [initialBoard, workflows] = await Promise.all([fetchBoardAction(), fetchWorkflowsAction()]);
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <TableroClient initialBoard={initialBoard} workflows={workflows} />
      </section>
    </main>
  );
}
