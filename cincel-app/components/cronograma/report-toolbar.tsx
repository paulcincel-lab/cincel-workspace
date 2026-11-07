"use client";

import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/shadcn/breadcrumb";
import { Button } from "@/components/ui/shadcn/button";

interface ReportToolbarProps {
  projectId: string;
  projectName: string;
}

/**
 * Screen-only header of the printable report in the new shell (redesign FE
 * §3.5, canvas `ProyectoReporte`): breadcrumb, title, "Volver" and "Imprimir".
 * Hidden when printing; the report has no style switch.
 */
export function ReportToolbar({ projectId, projectName }: ReportToolbarProps) {
  const base = `/proyectos/${encodeURIComponent(projectId)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 print:hidden">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Breadcrumb aria-label="Ruta">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/proyectos" />}>Proyectos</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={`${base}/ficha`} />}>{projectName}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={`${base}/cronograma`} />}>Cronograma</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Reporte</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-[22px] font-semibold text-foreground">Reporte de avance</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" render={<Link href={`${base}/cronograma`} />}>
          <ChevronLeft aria-hidden="true" />
          Volver
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Imprimir
        </Button>
      </div>
    </div>
  );
}
