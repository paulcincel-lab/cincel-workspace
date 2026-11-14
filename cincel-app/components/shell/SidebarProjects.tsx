"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/shadcn/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/shadcn/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { shellProjectsOptions } from "@/lib/query/options/shell";
import { activeProjectId, groupSidebarProjects, showsProjectsFilter } from "@/lib/shell/sidebar-projects";
import { selectInactiveProjectsOpen, selectProjectsOpen, useShellUi } from "@/lib/stores/shell-ui-store";
import type { ShellProject } from "@/lib/types/shell";
import type { NavItem } from "@/lib/ui/nav";
import type { NavPrefetchHandlers } from "@/lib/shell/nav-prefetch";

/**
 * The sidebar "Proyectos" entry with its collapsible submenu: the label links
 * to `/proyectos`, the chevron (a separate button with `aria-expanded` and
 * `aria-controls`) only toggles. The submenu lists every project the viewer
 * can see from `qk.shell.projects()`: active ones by name, then a collapsed
 * "Pausados y cerrados" group; above 12 projects a filter input shows. The
 * open states live in `useShellUi` (persisted).
 */
export function SidebarProjectsEntry({
  item,
  active,
  prefetch,
}: {
  item: NavItem;
  active: boolean;
  prefetch?: NavPrefetchHandlers;
}) {
  const Icon = item.icon;
  const pathname = usePathname();
  const open = useShellUi(selectProjectsOpen);
  const setOpen = useShellUi((s) => s.setProjectsOpen);
  const menuId = useId();
  const currentId = activeProjectId(pathname);
  // The page itself is only "active" while no project of the list is.
  const labelActive = active && currentId === null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="h-9"
        isActive={labelActive}
        render={<Link href={item.href} prefetch aria-current={active ? "page" : undefined} {...prefetch} />}
      >
        <Icon aria-hidden="true" strokeWidth={1.8} />
        <span>{item.label}</span>
      </SidebarMenuButton>
      <SidebarMenuAction
        type="button"
        aria-label={open ? "Ocultar proyectos" : "Mostrar proyectos"}
        aria-expanded={open}
        aria-controls={menuId}
        className="top-2"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight aria-hidden="true" className={open ? "rotate-90 transition-transform" : "transition-transform"} />
      </SidebarMenuAction>
      <div id={menuId} hidden={!open}>
        {open ? <ProjectsSubmenu currentId={currentId} /> : null}
      </div>
    </SidebarMenuItem>
  );
}

function ProjectRow({ project, current }: { project: ShellProject; current: boolean }) {
  return (
    <SidebarMenuSubItem>
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuSubButton
              isActive={current}
              data-project-link=""
              render={<Link href={`/proyectos/${project.id}`} aria-current={current ? "page" : undefined} />}
            />
          }
        >
          <span aria-hidden="true" className="size-[9px] shrink-0 rounded-[3px]" style={{ background: project.colorVar }} />
          <span className="min-w-0 truncate">{project.name}</span>
        </TooltipTrigger>
        <TooltipContent side="right">{project.name}</TooltipContent>
      </Tooltip>
    </SidebarMenuSubItem>
  );
}

function ProjectsSubmenu({ currentId }: { currentId: string | null }) {
  const { data, isPending } = useQuery(shellProjectsOptions());
  const inactiveOpen = useShellUi(selectInactiveProjectsOpen);
  const setInactiveOpen = useShellUi((s) => s.setInactiveProjectsOpen);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inactiveId = useId();
  const projects = data ?? [];
  const { active, inactive } = groupSidebarProjects(projects, query);
  const filtering = query.trim() !== "";
  // A filter shows its matches among the paused and closed ones too.
  const showInactive = inactive.length > 0 && (inactiveOpen || filtering);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const focusables = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("input, a[data-project-link], button") ?? [],
    );
    const index = focusables.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    const next = focusables[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  return (
    <div ref={listRef} onKeyDown={onKeyDown}>
      {showsProjectsFilter(projects.length) ? (
        <div className="mx-3.5 px-2.5 pt-1 pb-1">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar proyectos…"
            aria-label="Filtrar proyectos"
            className="h-7 text-xs"
          />
        </div>
      ) : null}
      <SidebarMenuSub className="max-h-72 overflow-y-auto" aria-label="Proyectos">
        {isPending ? (
          <li className="px-2 py-1 text-xs text-muted-foreground">Cargando proyectos…</li>
        ) : active.length === 0 && inactive.length === 0 ? (
          <li className="px-2 py-1 text-xs text-muted-foreground">
            {filtering ? "Ningún proyecto coincide." : "Aún no hay proyectos."}
          </li>
        ) : null}
        {active.map((project) => (
          <ProjectRow key={project.id} project={project} current={project.id === currentId} />
        ))}
        {inactive.length > 0 ? (
          <li className="flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={showInactive}
              aria-controls={inactiveId}
              disabled={filtering}
              onClick={() => setInactiveOpen(!inactiveOpen)}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
            >
              <ChevronRight
                aria-hidden="true"
                className={showInactive ? "size-3.5 rotate-90 transition-transform" : "size-3.5 transition-transform"}
              />
              <span className="truncate">{`Pausados y cerrados (${inactive.length})`}</span>
            </button>
            <ul id={inactiveId} hidden={!showInactive} className="flex min-w-0 flex-col gap-1">
              {showInactive
                ? inactive.map((project) => (
                    <ProjectRow key={project.id} project={project} current={project.id === currentId} />
                  ))
                : null}
            </ul>
          </li>
        ) : null}
      </SidebarMenuSub>
    </div>
  );
}
