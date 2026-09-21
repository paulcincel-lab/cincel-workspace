"use client";

import { Avatar, AvatarFallback } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { getPersonInitials } from "@/components/ui/TeamMultiSelect";
import { cn } from "@/lib/utils";
import type { StaffRef, TaskListItem } from "@/lib/types/core";

type FilterableTask = Pick<TaskListItem, "manager" | "support" | "project">;

/** Everyone assigned to a task: its manager plus the support team. */
function taskAssignees(task: FilterableTask): StaffRef[] {
  return task.manager ? [task.manager, ...task.support] : task.support;
}

/** True when the task is assigned to any selected member (no selection = all). */
export function matchesMemberFilter(task: FilterableTask, memberIds: string[]): boolean {
  return memberIds.length === 0 || taskAssignees(task).some((s) => memberIds.includes(s.id));
}

export function matchesProjectFilter(task: FilterableTask, projectId: string): boolean {
  return !projectId || task.project.id === projectId;
}

type Props = {
  tasks: FilterableTask[];
  memberIds: string[];
  onMemberIdsChange: (ids: string[]) => void;
  projectId: string;
  onProjectIdChange: (id: string) => void;
  /** Hide the built-in "Limpiar" button when the page has its own clear-all. */
  showClear?: boolean;
};

/**
 * Jira-style quick filters: click a member's avatar to show only the tasks
 * assigned to them (several can be combined), and pick a project. Options are
 * derived from the tasks passed in, so it works for any task list.
 */
export function TaskMemberProjectFilters({ tasks, memberIds, onMemberIdsChange, projectId, onProjectIdChange, showClear = true }: Props) {
  const members = new Map<string, StaffRef>();
  const projects = new Map<string, string>();
  for (const task of tasks) {
    for (const person of taskAssignees(task)) members.set(person.id, person);
    projects.set(task.project.id, task.project.name);
  }
  const memberList = [...members.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const projectList = [...projects.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const active = memberIds.length > 0 || projectId !== "";

  function toggle(id: string) {
    onMemberIdsChange(memberIds.includes(id) ? memberIds.filter((m) => m !== id) : [...memberIds, id]);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {memberList.length > 0 ? (
        <div className="flex items-center -space-x-1" role="group" aria-label="Filtrar por miembro">
          {memberList.map((person) => {
            const selected = memberIds.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => toggle(person.id)}
                aria-pressed={selected}
                title={person.name}
                className={cn(
                  "rounded-full outline-none transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "z-10 ring-2 ring-primary ring-offset-2 ring-offset-background" : memberIds.length > 0 ? "opacity-50" : ""
                )}
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                    {getPersonInitials(person.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            );
          })}
        </div>
      ) : null}

      <Select
        items={{ __all__: "Proyecto", ...Object.fromEntries(projectList) }}
        value={projectId || "__all__"}
        onValueChange={(v) => onProjectIdChange(v === "__all__" ? "" : (v as string))}
      >
        <SelectTrigger className="h-9 w-auto min-w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Proyecto</SelectItem>
          {projectList.map(([id, name]) => (
            <SelectItem key={id} value={id}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active && showClear ? (
        <Button variant="ghost" size="sm" onClick={() => { onMemberIdsChange([]); onProjectIdChange(""); }}>
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}
