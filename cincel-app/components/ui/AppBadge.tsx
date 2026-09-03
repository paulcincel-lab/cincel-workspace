import { Badge as ShadcnBadge } from "@/components/ui/shadcn/badge";
import { cn } from "@/lib/utils";

export type AppBadgeColor = "yellow" | "green" | "blue" | "red" | "gray" | "purple";

type Props = {
  label: string;
  color: AppBadgeColor;
};

const colorClasses: Record<AppBadgeColor, string> = {
  yellow: "bg-yellow-100 text-yellow-800",
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-slate-100 text-slate-700",
  purple: "bg-purple-100 text-purple-800",
};

export default function AppBadge({ label, color }: Props) {
  return (
    <ShadcnBadge
      variant="outline"
      className={cn("h-auto rounded-full border-transparent px-3 py-1 text-xs font-semibold", colorClasses[color])}
    >
      {label}
    </ShadcnBadge>
  );
}
