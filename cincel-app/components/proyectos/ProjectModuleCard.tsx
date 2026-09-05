import Link from "next/link";

import { Card, CardContent } from "@/components/ui/shadcn/card";

type Props = {
  title: string;
  icon: string;
  total: number;
  subtitle: string;
  href?: string;
};

export default function ProjectModuleCard({
  title,
  icon,
  total,
  subtitle,
  href = "#",
}: Props) {
  return (
    <Link href={href}>
      <Card className="h-full cursor-pointer rounded-2xl shadow-sm transition hover:shadow-lg [--card-spacing:--spacing(6)]">
        <CardContent>
          <div className="text-3xl">{icon}</div>

          <h3 className="mt-4 text-xl font-bold">{title}</h3>

          <p className="mt-5 text-4xl font-bold">{total}</p>

          <p className="mt-2 text-muted-foreground">{subtitle}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
