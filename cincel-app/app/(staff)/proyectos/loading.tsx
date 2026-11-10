"use client";

import { usePathname } from "next/navigation";

import { RouteLoading } from "@/components/shell/RouteLoading";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { ProjectsEsencialSkeleton, ProjectsVisualSkeleton } from "@/components/widgets/route-skeletons";

/**
 * /proyectos loading state: the list's skeleton for the active Estilo (Visual:
 * header, four summary blocks, three attention blocks, four board columns and
 * the timeline; Esencial: its soft cards; Analítico: the route default).
 * The project pages below `/proyectos/<id>` keep the route-group skeleton.
 */
export default function ProyectosLoading() {
  const pathname = usePathname();
  if (pathname !== "/proyectos") return <RouteLoading />;
  return (
    <PageStyleLayout
      visual={() => <ProjectsVisualSkeleton />}
      esencial={() => <ProjectsEsencialSkeleton />}
      analitico={() => <RouteLoading />}
    />
  );
}
