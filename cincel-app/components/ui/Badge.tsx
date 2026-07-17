type Props = {
  label: string;
  color:
    | "yellow"
    | "green"
    | "blue"
    | "red"
    | "gray"
    | "purple";
};

export default function Badge({ label, color }: Props) {
  const colors = {
    yellow: "bg-yellow-100 text-yellow-800",
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-slate-100 text-slate-700",
    purple: "bg-purple-100 text-purple-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${colors[color]}`}
    >
      {label}
    </span>
  );
}