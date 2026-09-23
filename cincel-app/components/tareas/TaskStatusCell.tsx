"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import InlineEditable from "@/components/ui/InlineEditable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import {
  BASE_STATUS_VARIANT,
  customStatusVariant,
  statusSelectItems,
  statusSelectValue,
  taskStatusLabel,
} from "@/lib/tasks/status-options";
import type { TaskListItem, TaskStatusOption } from "@/lib/types/core";

type Props = {
  task: TaskListItem;
  customStatuses: TaskStatusOption[];
  canChange: boolean;
  /** Receives a status select value — parse it with parseStatusValue. */
  onChange: (value: string) => void;
};

/** A task's status badge, editable in place over the built-in and custom statuses. */
export function TaskStatusCell({ task, customStatuses, canChange, onChange }: Props) {
  const badge = (
    <Badge variant={task.customStatus ? customStatusVariant(task.customStatus) : BASE_STATUS_VARIANT[task.status]}>
      {taskStatusLabel(task)}
    </Badge>
  );
  if (!canChange) return badge;

  const items = statusSelectItems(customStatuses);
  return (
    <InlineEditable
      value={statusSelectValue(task)}
      onCommit={onChange}
      commitOnChange
      renderDisplay={() => badge}
      renderEditor={({ onChange: onEditorChange, onBlur }) => (
        <Select
          defaultOpen
          items={Object.fromEntries(items.map((i) => [i.value, i.label]))}
          value={statusSelectValue(task)}
          onValueChange={(next) => {
            onEditorChange(next as string);
            onBlur();
          }}
        >
          <SelectTrigger className="w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}
