"use client";

import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { initialsOf } from "@/lib/soporte/mejoras-triage";
import {
  KIND_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type TicketFilters,
  type TicketListRow,
  type TicketPerson,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/types/soporte";

/** What the views of Mejoras share: props, avatar, chips and the select used by the filters and cells. */
export type MejorasViewProps = {
  /** The filters of the URL (the table reads them; the board and the list always show everything). */
  filters: TicketFilters;
  onFiltersChange(next: TicketFilters): void;
  /** Opens the detail of the solicitud with this code (`?solicitud=`). */
  onOpen(code: string): void;
};

export const EMPTY_TEXT = "No hay solicitudes.";

export function TicketAvatar({ person, className }: { person: TicketPerson; className?: string }) {
  return (
    <Avatar size="sm" className={className} title={person.name}>
      {person.photoUrl ? <AvatarImage src={person.photoUrl} alt="" /> : null}
      <AvatarFallback>{initialsOf(person.name)}</AvatarFallback>
    </Avatar>
  );
}

const PRIORITY_VARIANT: Record<TicketPriority, "destructive" | "warning" | "outline"> = {
  alta: "destructive",
  media: "warning",
  baja: "outline",
};

export function PriorityChip({ priority }: { priority: TicketPriority | null }) {
  if (!priority) return null;
  return <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

const STATUS_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline" | "warning" | "success" | "destructive"> = {
  nuevo: "default",
  en_revision: "secondary",
  planeado: "outline",
  en_progreso: "warning",
  resuelto: "success",
  descartado: "destructive",
};

export function StatusChip({ status }: { status: TicketStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function KindChip({ kind }: { kind: TicketListRow["kind"] }) {
  return <Badge variant="secondary">{KIND_LABEL[kind]}</Badge>;
}

/** The GitHub issue the solicitud was published as, as a link chip; nothing while it is not published. */
export function GithubChip({ row }: { row: Pick<TicketListRow, "githubIssueNumber" | "githubIssueUrl"> }): ReactNode {
  if (row.githubIssueNumber === null) return null;
  const label = `GitHub #${row.githubIssueNumber}`;
  if (!row.githubIssueUrl) return <Badge variant="outline">{label}</Badge>;
  return (
    <a
      href={row.githubIssueUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (se abre en otra pestaña)`}
      onClick={(event) => event.stopPropagation()}
    >
      <Badge variant="outline">{label}</Badge>
    </a>
  );
}

export type PickOption = { value: string; label: string; disabled?: boolean };

/** A plain shadcn Select over `options`; a `null` pick keeps the current value. */
export function PickSelect({
  value,
  options,
  label,
  onPick,
  disabled,
  className,
}: {
  value: string;
  options: readonly PickOption[];
  label: string;
  onPick(value: string): void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select items={options as PickOption[]} value={value} onValueChange={(next) => (next ? onPick(next as string) : undefined)} disabled={disabled}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
