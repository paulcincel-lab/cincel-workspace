import { Badge } from "@/components/ui/shadcn/badge";
import type {
  BadgeVariant,
} from "@/lib/types/status-visuals";
import {
  CONTACT_TYPE_VARIANT,
  PROJECT_STAGE_VARIANT,
  PROJECT_STATUS_VARIANT,
  TASK_PRIORITY_VARIANT,
  TASK_STATUS_VARIANT,
} from "@/lib/types/status-visuals";
import type {
  ContactType,
  ProjectStage,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "@/lib/types/enums";

type StatusBadgeProps =
  | { kind: "task-status"; value: TaskStatus }
  | { kind: "task-priority"; value: TaskPriority }
  | { kind: "project-status"; value: ProjectStatus }
  | { kind: "project-stage"; value: ProjectStage }
  | { kind: "contact-type"; value: ContactType };

const VARIANT_BY_KIND: {
  [K in StatusBadgeProps["kind"]]: Record<
    Extract<StatusBadgeProps, { kind: K }>["value"],
    BadgeVariant
  >;
} = {
  "task-status": TASK_STATUS_VARIANT,
  "task-priority": TASK_PRIORITY_VARIANT,
  "project-status": PROJECT_STATUS_VARIANT,
  "project-stage": PROJECT_STAGE_VARIANT,
  "contact-type": CONTACT_TYPE_VARIANT,
};

/**
 * A Badge whose color is derived from a typed status/stage/priority value
 * instead of a caller-chosen color prop. Centralizes what used to be a
 * `statusColor`/`phaseColor` switch duplicated per page — see
 * lib/types/status-visuals.ts for the underlying map.
 */
export function StatusBadge(props: StatusBadgeProps) {
  const variants = VARIANT_BY_KIND[props.kind] as Record<string, BadgeVariant>;
  const variant = variants[props.value] ?? "outline";
  return <Badge variant={variant}>{props.value}</Badge>;
}
