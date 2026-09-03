import type { CellContext, ColumnDef } from "@tanstack/react-table";
import AppBadge from "@/components/ui/AppBadge";
import Avatar from "@/components/ui/Avatar";
import InlineEditable from "@/components/ui/InlineEditable";
import TeamMultiSelect, { TeamMembersCompact } from "@/components/ui/TeamMultiSelect";
import type { Task, TaskStatus } from "@/lib/types/task";
import { formatDateDMY } from "@/lib/utils/date";

function phaseColor(
  phase: string
): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  switch (phase.toLowerCase()) {
    case "inicial":
      return "gray";
    case "presentación":
      return "blue";
    case "con cliente":
      return "purple";
    case "minutas":
      return "yellow";
    case "cobro":
      return "green";
    default:
      return "gray";
  }
}

function statusColor(
  status: string
): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  switch (status) {
    case "Pendiente":
      return "yellow";
    case "En proceso":
      return "blue";
    case "Completado":
      return "green";
    case "Bloqueado":
      return "red";
    default:
      return "gray";
  }
}

export type BuildPresaleColumnsOptions = {
  phaseOptions: string[];
  teamMembers: string[];
  availableProjects: string[];
  canChangeResponsible: boolean;
  canReorderPhases: boolean;
  canDeleteActivity: boolean;
  /** Per-row: whether the viewer may change this task's status. */
  getCanChangeStatus: (task: Task) => boolean;
  onSave: (updatedTask: Task) => void;
  onDelete: (taskId: number) => void;
  onOpenDetail: (task: Task) => void;
};

/**
 * Builds the PresaleTable column definitions for DataTable. This reproduces
 * every cell exactly as the former hand-rolled <PresaleRow> <tr> did —
 * inline-editable inputs/selects, badges, avatars — only the outer table
 * rendering (now DataTable/@tanstack/react-table) changed.
 */
export function buildPresaleColumns({
  phaseOptions,
  teamMembers,
  availableProjects,
  canChangeResponsible,
  canReorderPhases,
  canDeleteActivity,
  getCanChangeStatus,
  onSave,
  onDelete,
  onOpenDetail,
}: BuildPresaleColumnsOptions): ColumnDef<Task, unknown>[] {
  const updateField = <K extends keyof Task>(task: Task, field: K, value: Task[K]) => {
    onSave({
      ...task,
      [field]: value,
      updatedAt: "Hoy",
    });
  };

  const handleArchive = (task: Task) => {
    onSave({
      ...task,
      archived: !task.archived,
      updatedAt: "Hoy",
    });
  };

  const handleDelete = (task: Task) => {
    const confirmed = window.confirm(
      `Se eliminara la tarea "${task.description}" del proyecto "${task.project}". Esta accion no se puede deshacer. Deseas continuar?`
    );

    if (!confirmed) {
      return;
    }

    onDelete(task.id);
  };

  return [
    {
      id: "project",
      accessorFn: (task) => task.project,
      header: "Proyecto",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        const selectableProjects = Array.from(
          new Set([
            ...availableProjects,
            ...(task.project && !availableProjects.includes(task.project) ? [task.project] : []),
          ])
        ).sort((a, b) => a.localeCompare(b));

        return (
          <InlineEditable
            value={task.project}
            onCommit={(value) => updateField(task, "project", value)}
            renderDisplay={(value) => <span className="font-medium text-black">{value}</span>}
            renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
              <select
                autoFocus
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {selectableProjects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            )}
          />
        );
      },
    },
    {
      id: "phase",
      accessorFn: (task) => task.phase,
      header: "Fase",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        const stagePhaseOptions = [...phaseOptions, "Otro..."];
        const selectablePhaseOptions = Array.from(
          new Set([...stagePhaseOptions, ...(task.phase && !stagePhaseOptions.includes(task.phase) ? [task.phase] : [])])
        );

        return (
          <div className="align-middle overflow-hidden text-black">
            {canReorderPhases ? (
              <InlineEditable
                value={task.phase}
                onCommit={(value) => updateField(task, "phase", value)}
                commitOnChange
                renderDisplay={(value) => (
                  <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                    <AppBadge label={value} color={phaseColor(value)} />
                  </span>
                )}
                renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                  <select
                    autoFocus
                    value={value}
                    onChange={(event) => {
                      const selected = event.target.value;

                      if (selected === "Otro...") {
                        const customPhase = window.prompt("Nueva fase", "");
                        const trimmed = customPhase?.trim();

                        if (trimmed) {
                          onChange(trimmed);
                        } else {
                          onBlur();
                        }

                        return;
                      }

                      onChange(selected);
                    }}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {selectablePhaseOptions.map((phaseOption) => (
                      <option key={phaseOption} value={phaseOption}>
                        {phaseOption}
                      </option>
                    ))}
                  </select>
                )}
              />
            ) : (
              <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                <AppBadge label={task.phase} color={phaseColor(task.phase)} />
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "description",
      accessorFn: (task) => task.description,
      header: "Descripción",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="align-middle font-medium text-black">
            <InlineEditable
              value={task.description}
              onCommit={(value) => updateField(task, "description", value)}
              renderDisplay={(value) => (
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                  {value}
                </span>
              )}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <input
                  autoFocus
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  onBlur={onBlur}
                  onKeyDown={onKeyDown}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              )}
            />
          </div>
        );
      },
    },
    {
      id: "notes",
      header: "Seguimiento",
      enableSorting: false,
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        const latestNote = task.history.length > 0
          ? task.history[task.history.length - 1].comment
          : task.notes;

        return (
          <div className="flex items-center justify-between gap-2 align-middle text-sm text-black">
            <span className="truncate text-black" title={latestNote || "Sin seguimiento"}>
              {latestNote || "Sin seguimiento"}
            </span>
            <button
              type="button"
              onClick={() => onOpenDetail(task)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xs text-black hover:bg-slate-100"
              aria-label="Abrir detalle"
              title="Ver detalle"
            >
              ⓘ
            </button>
          </div>
        );
      },
    },
    {
      id: "manager",
      accessorFn: (task) => task.manager,
      header: "Responsable",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="align-middle text-black">
            {canChangeResponsible ? (
              <InlineEditable
                value={task.manager}
                onCommit={(value) => updateField(task, "manager", value)}
                commitOnChange
                renderDisplay={(value) => <AppAvatar name={value} />}
                renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                  <select
                    autoFocus
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {teamMembers.map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                )}
              />
            ) : (
              <AppAvatar name={task.manager} />
            )}
          </div>
        );
      },
    },
    {
      id: "support",
      header: "Equipo",
      enableSorting: false,
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="align-middle text-black">
            <InlineEditable
              value={task.support.join("||")}
              onCommit={(value) =>
                updateField(
                  task,
                  "support",
                  value
                    .split("||")
                    .map((item) => item.trim())
                    .filter(Boolean)
                )
              }
              renderDisplay={() => <TeamMembersCompact members={task.support} />}
              renderEditor={({ value, onChange, onBlur }) => (
                <TeamMultiSelect
                  options={teamMembers}
                  selected={value
                    .split("||")
                    .map((item) => item.trim())
                    .filter(Boolean)}
                  onChange={(members) => {
                    const serialized = members.join("||");
                    onChange(serialized);
                    updateField(task, "support", members);
                  }}
                  onBlur={onBlur}
                />
              )}
            />
          </div>
        );
      },
    },
    {
      id: "status",
      accessorFn: (task) => task.status,
      header: "Estatus",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="min-w-[150px] whitespace-nowrap align-middle text-black">
            {getCanChangeStatus(task) ? (
              <InlineEditable
                value={task.status}
                onCommit={(value) => updateField(task, "status", value as TaskStatus)}
                commitOnChange
                renderDisplay={(value) => <AppBadge label={value} color={statusColor(value)} />}
                renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                  <select
                    autoFocus
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="En proceso">En proceso</option>
                    <option value="Completado">Completado</option>
                    <option value="Bloqueado">Bloqueado</option>
                  </select>
                )}
              />
            ) : (
              <AppBadge label={task.status} color={statusColor(task.status)} />
            )}
          </div>
        );
      },
    },
    {
      id: "commitmentDate",
      header: () => (
        <span className="inline-flex flex-col">
          <span className="block leading-none">Compromiso</span>
          <span className="mt-1 block text-[11px] font-medium normal-case text-slate-600">(no mover fecha)</span>
        </span>
      ),
      accessorFn: (task) => task.commitmentDate || "",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="min-w-[165px] whitespace-nowrap align-middle text-sm text-black">
            <InlineEditable
              value={task.commitmentDate || ""}
              onCommit={(value) => updateField(task, "commitmentDate", value)}
              renderDisplay={(value) => <span>{formatDateDMY(value)}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <input
                  autoFocus
                  type="date"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  onBlur={onBlur}
                  onKeyDown={onKeyDown}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              )}
            />
          </div>
        );
      },
    },
    {
      id: "reviewDate",
      accessorFn: (task) => task.reviewDate || "",
      header: "Próxima revisión",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="min-w-[180px] whitespace-nowrap align-middle text-sm text-black">
            <InlineEditable
              value={task.reviewDate || ""}
              onCommit={(value) => updateField(task, "reviewDate", value)}
              renderDisplay={(value) => <span>{formatDateDMY(value)}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <input
                  autoFocus
                  type="date"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  onBlur={onBlur}
                  onKeyDown={onKeyDown}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              )}
            />
          </div>
        );
      },
    },
    {
      id: "deliveryDate",
      accessorFn: (task) => task.deliveryDate || "",
      header: "Fecha entrega",
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="min-w-[165px] whitespace-nowrap align-middle text-sm text-black">
            <InlineEditable
              value={task.deliveryDate || ""}
              onCommit={(value) => updateField(task, "deliveryDate", value)}
              renderDisplay={(value) => <span>{formatDateDMY(value)}</span>}
              renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
                <input
                  autoFocus
                  type="date"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  onBlur={onBlur}
                  onKeyDown={onKeyDown}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              )}
            />
          </div>
        );
      },
    },
    {
      id: "updatedAt",
      accessorFn: (task) => task.updatedAt || "",
      header: "Fecha actualizada",
      cell: ({ row }: CellContext<Task, unknown>) => (
        <span className="align-middle text-sm text-black">{row.original.updatedAt || "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "Acciones",
      enableSorting: false,
      cell: ({ row }: CellContext<Task, unknown>) => {
        const task = row.original;
        return (
          <div className="flex items-center gap-2 align-middle text-sm text-black">
            <button
              type="button"
              onClick={() => onOpenDetail(task)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-black hover:bg-slate-100"
            >
              Detalle
            </button>
            <button
              type="button"
              onClick={() => handleArchive(task)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${task.archived ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 text-black hover:bg-slate-100"}`}
            >
              {task.archived ? "Desarchivar" : "Archivar"}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(task)}
              disabled={!canDeleteActivity}
              title={canDeleteActivity ? "" : "No tienes permiso para eliminar actividades"}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${canDeleteActivity ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
            >
              Eliminar
            </button>
          </div>
        );
      },
    },
  ];
}
