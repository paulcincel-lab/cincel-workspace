import Link from "next/link";

import AppBadge from "@/components/ui/AppBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";

type Props = {
  project: {
    id: number;
    name: string;
    client: {
      name: string;
    };
    manager: string;
    phase: string;
    progress: number;
    status: string;
  };
};

export default function ProjectCard({ project }: Props) {
  return (
    <Link href={`/proyectos/${project.id}`}>
      <Card className="rounded-2xl shadow-sm transition hover:shadow-lg [--card-spacing:--spacing(6)]">
        <CardHeader className="flex-row items-start justify-between">
          <CardTitle className="text-xl font-bold">{project.name}</CardTitle>
          <AppBadge label={project.status} color={project.status === "Activo" ? "green" : "gray"} />
        </CardHeader>

        <CardContent>
          <p className="text-muted-foreground">{project.client.name}</p>

          <div className="mt-6">
            <div className="flex justify-between text-sm">
              <span>{project.phase}</span>
              <span>{project.progress}%</span>
            </div>

            <Progress
              value={project.progress}
              className="mt-2"
              indicatorClassName="bg-foreground"
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
