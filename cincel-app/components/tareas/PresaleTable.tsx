"use client";

import { useMemo, useState } from "react";

import type { Task } from "@/lib/types/task";
import { presaleTasks } from "@/lib/data/presale";

import PresaleRow from "./PresaleRow";
import TaskDrawer from "./TaskDrawer";
import NewTaskModal from "./NewTaskModal";

export default function PresaleTable() {

  const [tasks, setTasks] = useState<Task[]>(presaleTasks);

  const [search, setSearch] = useState("");

  const [managerFilter, setManagerFilter] =
    useState("Todos");

  const [phaseFilter, setPhaseFilter] =
    useState("Todas");

  const [statusFilter, setStatusFilter] =
    useState("Todos");

  const [selectedTask, setSelectedTask] =
    useState<Task | null>(null);

  const [showNewTask, setShowNewTask] =
    useState(false);

  const managers = [
    "Todos",
    ...new Set(tasks.map((task) => task.manager)),
  ];

  const phases = [
    "Todas",
    ...new Set(tasks.map((task) => task.phase)),
  ];

  const statuses = [
    "Todos",
    ...new Set(tasks.map((task) => task.status)),
  ];

  const filteredTasks = useMemo(() => {

    const value = search.toLowerCase();

    return tasks.filter((task) => {

      const matchesSearch =
        task.project.toLowerCase().includes(value) ||
        task.description.toLowerCase().includes(value) ||
        task.phase.toLowerCase().includes(value) ||
        task.manager.toLowerCase().includes(value) ||
        task.status.toLowerCase().includes(value);

      const matchesManager =
        managerFilter === "Todos" ||
        task.manager === managerFilter;

      const matchesPhase =
        phaseFilter === "Todas" ||
        task.phase === phaseFilter;

      const matchesStatus =
        statusFilter === "Todos" ||
        task.status === statusFilter;

      return (
        matchesSearch &&
        matchesManager &&
        matchesPhase &&
        matchesStatus
      );

    });

  }, [
    tasks,
    search,
    managerFilter,
    phaseFilter,
    statusFilter,
  ]);

  return (

    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">

      <div className="p-6 border-b border-slate-200">

        <div className="flex justify-between items-center">

          <div>

            <h1 className="text-3xl font-bold">
              Presale
            </h1>

            <p className="text-slate-500 mt-1">
              Flujo comercial y de contratación.
            </p>

          </div>

          <button
            onClick={() => setShowNewTask(true)}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl hover:bg-blue-700 transition"
          >
            + Nueva tarea
          </button>

        </div>

      </div>

      <div className="p-6 border-b border-slate-200 flex flex-wrap gap-4">

        <input
          type="text"
          placeholder="Buscar tarea..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-xl px-4 py-2 w-72"
        />

        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="border rounded-xl px-4 py-2"
        >
          {managers.map((manager) => (
            <option key={manager}>
              {manager}
            </option>
          ))}
        </select>

        <select
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value)}
          className="border rounded-xl px-4 py-2"
        >
          {phases.map((phase) => (
            <option key={phase}>
              {phase}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-xl px-4 py-2"
        >
          {statuses.map((status) => (
            <option key={status}>
              {status}
            </option>
          ))}
        </select>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead className="bg-slate-50 border-b">

            <tr className="text-left text-sm text-slate-600">

              <th className="p-4 w-12"></th>

              <th>Proyecto</th>

              <th>Fase</th>

              <th>Descripción</th>

              <th>Seguimiento</th>

              <th>Responsable</th>

              <th>Equipo</th>

              <th>Estatus</th>

              <th>Compromiso</th>

              <th>Próxima revisión</th>

              <th>Modificado</th>

            </tr>

          </thead>

          <tbody>
                      {filteredTasks.map((task) => (
              <PresaleRow
                key={task.id}
                task={task}
                onClick={() => setSelectedTask(task)}
              />
            ))}

          </tbody>

        </table>

      </div>

      <TaskDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSave={(updatedTask) => {

          setTasks((current) =>
            current.map((task) =>
              task.id === updatedTask.id
                ? updatedTask
                : task
            )
          );

          setSelectedTask(updatedTask);

        }}
      />

      <NewTaskModal
        open={showNewTask}
        onClose={() => setShowNewTask(false)}
        onSave={(task) => {

          const newTask: Task = {

            id: tasks.length + 1,

            project: "Ensenada",

            workflow: "Presale",

            phase: "Inicial",

            description: task.description,

            notes: task.notes,

            manager: task.manager,

            support: [],

            status: task.status as Task["status"],

            priority: "Media",

            commitmentDate: task.commitmentDate,

            reviewDate: task.reviewDate,

            updatedAt: "Hoy",

            createdAt: "Hoy",

            history: [],

            checklist: [],

          };

          setTasks((current) => [
            ...current,
            newTask,
          ]);

          setShowNewTask(false);

        }}
      />

    </div>

  );

}