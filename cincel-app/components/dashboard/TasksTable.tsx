"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { tasks } from "@/lib/data/tasks";

type Task = (typeof tasks)[number];

const columns: ColumnDef<Task, unknown>[] = [
  {
    accessorKey: "project",
    header: "Proyecto",
    cell: ({ row }) => <span className="font-medium">{row.original.project}</span>,
  },
  {
    accessorKey: "phase",
    header: "Fase",
  },
  {
    accessorKey: "title",
    header: "Tarea",
  },
  {
    accessorKey: "assignedTo",
    header: "Responsable",
    cell: ({ row }) => <span className="font-medium">{row.original.assignedTo}</span>,
  },
  {
    id: "support",
    accessorFn: (task) => task.support.join(", "),
    header: "Apoyo",
    cell: ({ row }) => (row.original.support.length > 0 ? row.original.support.join(", ") : "-"),
  },
  {
    accessorKey: "priority",
    header: "Prioridad",
    cell: ({ row }) => {
      const priority = row.original.priority;
      return (
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            priority === "Alta"
              ? "bg-red-100 text-red-700"
              : priority === "Media"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {priority}
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Estatus",
    cell: ({ row }) => {
      const status = row.original.status;
      return (
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            status === "Pendiente"
              ? "bg-yellow-100 text-yellow-700"
              : status === "En proceso"
              ? "bg-blue-100 text-blue-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: "dueDate",
    header: "Entrega",
  },
];

export default function TasksTable() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold">
          Mis tareas
        </h2>

        <p className="text-slate-500">
          Tareas asignadas para hoy
        </p>
      </div>

      <DataTable
        columns={columns}
        data={tasks}
        getRowId={(task) => String(task.id)}
        wrapperClassName="rounded-none border-0 shadow-none"
      />
    </div>
  );
}
