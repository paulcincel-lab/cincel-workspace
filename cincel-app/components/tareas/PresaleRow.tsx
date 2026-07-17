import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";

type Props = {
  task: any;
  onClick: () => void;
};

function phaseColor(
  phase: string
): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  switch (phase) {
    case "Inicial":
      return "gray";
    case "Presentación":
      return "blue";
    case "Con Cliente":
      return "purple";
    case "Minutas":
      return "yellow";
    case "Cobro":
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
  onClick,
}: Props) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-slate-100 hover:bg-blue-50 transition-all duration-150"
    >
      <td className="p-4">
        <input type="checkbox" />
      </td>

      <td className="font-medium">
        {task.project}
      </td>

      <td>
        <Badge
          label={task.phase}
          color={phaseColor(task.phase)}
        />
      </td>

      <td className="font-medium">
        {task.description}
      </td>

      <td className="text-center">
        {task.notes ? "💬" : "—"}
      </td>

      <td>
        <Avatar name={task.manager} />
      </td>

      <td>
        {task.support.length
          ? task.support.join(", ")
          : "—"}
      </td>

      <td>
        <Badge
          label={task.status}
          color={statusColor(task.status)}
        />
      </td>

      <td className="text-sm">
        {task.commitmentDate || "—"}
        </td>
        <td className="text-sm">
            {task.reviewDate || "—"}
      </td>

      <td>
        {task.updatedAt}
        {task.reviewDate}
      </td>
    </tr>
  );
}