import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import InlineEditableField from "@/components/ui/InlineEditableField";
import TeamMultiSelect, { TeamMembersCompact } from "@/components/ui/TeamMultiSelect";
import type { Task, TaskStatus } from "@/lib/types/task";
import { formatDateDMY } from "@/lib/utils/date";

type Props = {
  task: Task;
  onSave: (updatedTask: Task) => void;
  teamMembers: string[];
  onOpenDetail: (task: Task) => void;
  availableProjects: string[];
  phaseOptions: string[];
};

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

export default function PresaleRow({
  task,
  onSave,
  teamMembers,
  onOpenDetail,
  availableProjects,
  phaseOptions,
}: Props) {
  const stagePhaseOptions = [...phaseOptions, "Otro..."];
  const selectablePhaseOptions = Array.from(
    new Set([...stagePhaseOptions, ...(task.phase && !stagePhaseOptions.includes(task.phase) ? [task.phase] : [])])
  );

  const updateField = <K extends keyof Task>(field: K, value: Task[K]) => {
    onSave({
      ...task,
      [field]: value,
      updatedAt: "Hoy",
    });
  };

  const latestNote = task.history.length > 0
    ? task.history[task.history.length - 1].comment
    : task.notes;

  const handleArchive = () => {
    onSave({
      ...task,
      archived: !task.archived,
      updatedAt: "Hoy",
    });
  };

  return (
    <tr className={`border-b border-slate-100 transition-all duration-150 ${task.archived ? "bg-slate-50 opacity-80" : "hover:bg-blue-50"}`}>
      <td className="w-[7%] px-4 py-3 font-medium">
        <InlineEditableField
          value={task.project}
          onCommit={(value) => updateField("project", value)}
          renderDisplay={(value) => <span>{value}</span>}
          renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
            <select
              autoFocus
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {availableProjects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          )}
        />
      </td>

      <td className="w-[6%] px-4 py-3 align-middle overflow-hidden">
        <InlineEditableField
          value={task.phase}
          onCommit={(value) => updateField("phase", value)}
          commitOnChange
          renderDisplay={(value) => (
            <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
              <Badge label={value} color={phaseColor(value)} />
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
      </td>

      <td className="w-[23%] px-4 py-3 align-middle font-medium">
        <InlineEditableField
          value={task.description}
          onCommit={(value) => updateField("description", value)}
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
      </td>

      <td className="w-[14%] px-4 py-3 align-middle">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate text-slate-700" title={latestNote || "Sin seguimiento"}>
            {latestNote || "Sin seguimiento"}
          </span>
          <button
            type="button"
            onClick={() => onOpenDetail(task)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
            aria-label="Abrir detalle"
            title="Ver detalle"
          >
            ⓘ
          </button>
        </div>
      </td>

      <td className="w-[12%] px-4 py-3 align-middle">
        <InlineEditableField
          value={task.manager}
          onCommit={(value) => updateField("manager", value)}
          commitOnChange
          renderDisplay={(value) => <Avatar name={value} />}
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
      </td>

      <td className="w-[12%] px-4 py-3 align-middle">
        <InlineEditableField
          value={task.support.join("||")}
          onCommit={(value) =>
            updateField(
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
                updateField("support", members);
              }}
              onBlur={onBlur}
            />
          )}
        />
      </td>

      <td className="w-[11%] min-w-[150px] whitespace-nowrap px-4 py-3 align-middle">
        <InlineEditableField
          value={task.status}
          onCommit={(value) => updateField("status", value as TaskStatus)}
          commitOnChange
          renderDisplay={(value) => <Badge label={value} color={statusColor(value)} />}
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
      </td>

      <td className="w-[12%] min-w-[165px] whitespace-nowrap px-4 py-3 align-middle text-sm">
        <InlineEditableField
          value={task.commitmentDate || ""}
          onCommit={(value) => updateField("commitmentDate", value)}
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
      </td>

      <td className="w-[13%] min-w-[180px] whitespace-nowrap px-4 py-3 align-middle text-sm">
        <InlineEditableField
          value={task.reviewDate || ""}
          onCommit={(value) => updateField("reviewDate", value)}
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
      </td>

      <td className="w-[12%] min-w-[165px] whitespace-nowrap px-4 py-3 align-middle text-sm">
        <InlineEditableField
          value={task.deliveryDate || ""}
          onCommit={(value) => updateField("deliveryDate", value)}
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
      </td>

      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        {task.updatedAt || "—"}
      </td>

      <td className="px-4 py-3 align-middle text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(task)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Detalle
          </button>
          <button
            type="button"
            onClick={handleArchive}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${task.archived ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
          >
            {task.archived ? "Desarchivar" : "Archivar"}
          </button>
        </div>
      </td>
    </tr>
  );
}