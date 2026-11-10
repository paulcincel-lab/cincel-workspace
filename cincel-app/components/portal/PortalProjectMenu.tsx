"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";

import { buttonVariants } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { parsePortalProjectTab, portalProjectTabHref } from "@/lib/portal/project-tabs";
import { portalHomeOptions } from "@/lib/query/options/portal";
import { cn } from "@/lib/utils";

/** `/portal/proyectos/<id>` and nothing deeper → `<id>`. */
const PROJECT_PAGE = /^\/portal\/proyectos\/([^/]+)\/?$/;

export function portalProjectIdFromPath(pathname: string | null): string | null {
  const match = pathname ? PROJECT_PAGE.exec(pathname) : null;
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Project switcher of the portal top bar (Portal Visual). Only on `/portal/proyectos/[id]`; the items are the
 * client's projects with active access (`portal.projects()`), each a link to the same tab of that project, the
 * current one marked `aria-current="page"` with a check. With a single project it is plain text. The home
 * stays reachable through the logo. Keyboard: Enter, Space or ↓ opens, arrows move, Esc closes and returns
 * focus to the trigger (the shadcn menu).
 */
export default function PortalProjectMenu() {
  const projectId = portalProjectIdFromPath(usePathname());
  return projectId ? <ProjectMenu projectId={projectId} /> : null;
}

function ProjectMenu({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const query = useQuery(portalHomeOptions());

  const projects = query.data?.projects ?? [];
  const current = projects.find((p) => p.id === projectId);
  if (!current) return null;

  const tab = parsePortalProjectTab(searchParams?.get("tab") ?? undefined);

  if (projects.length === 1) {
    return (
      <span className="min-w-0 truncate text-[13px] font-medium" title={current.name}>
        {current.name}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Proyecto: ${current.name}. Cambiar de proyecto`}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-8 min-w-0 max-w-full justify-between gap-1.5 rounded-[10px] text-[13px] font-medium",
        )}
      >
        <span className="min-w-0 truncate">{current.name}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56 max-w-[calc(100vw-2rem)]">
        {projects.map((project) => {
          const isCurrent = project.id === projectId;
          return (
            <DropdownMenuItem
              key={project.id}
              render={<Link href={portalProjectTabHref(project.id, tab)} aria-current={isCurrent ? "page" : undefined} />}
            >
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {isCurrent ? <Check aria-hidden="true" className="ml-2" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
