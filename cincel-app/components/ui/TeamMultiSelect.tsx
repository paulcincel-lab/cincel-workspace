"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";

type Props = {
  options: string[];
  selected: string[];
  onChange: (members: string[]) => void;
  placeholder?: string;
  onBlur?: () => void;
  /** Options that can't be added or removed here, with the reason shown as their title. */
  locked?: string[];
  lockedTitle?: string;
  /** Shown in the chip row when nothing is selected. */
  emptyText?: string;
};

export function getPersonInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function TeamMembersCompact({ members }: { members: string[] }) {
  if (members.length === 0) {
    return <span className="text-sm text-muted-foreground">Sin equipo</span>;
  }

  const visibleMembers = members.slice(0, 2);
  const remaining = members.length - visibleMembers.length;
  const nameList = visibleMembers.join(", ");

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {visibleMembers.map((member, index) => (
          <span
            key={member}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background ring-2 ring-background ${index > 0 ? "-ml-1" : ""}`}
            title={member}
          >
            {getPersonInitials(member)}
          </span>
        ))}
        {remaining > 0 ? (
          <span className="-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
            +{remaining}
          </span>
        ) : null}
      </div>
      <span className="text-sm font-medium text-foreground">
        {nameList}
        {remaining > 0 ? ` +${remaining}` : ""}
      </span>
    </div>
  );
}

export default function TeamMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Buscar colaborador...",
  onBlur,
  locked = [],
  lockedTitle,
  emptyText = "Sin integrantes asignados",
}: Props) {
  const [query, setQuery] = useState("");
  const lockedSet = useMemo(() => new Set(locked), [locked]);

  const filteredOptions = useMemo(() => {
    const lowered = query.toLowerCase();
    return options.filter((member) =>
      member.toLowerCase().includes(lowered)
    );
  }, [options, query]);

  const toggleMember = (member: string) => {
    if (lockedSet.has(member)) return;
    if (selected.includes(member)) {
      onChange(selected.filter((item) => item !== member));
      return;
    }

    onChange([...selected, member]);
  };

  return (
    <div
      className="w-full rounded-xl border border-border bg-transparent p-2"
      tabIndex={-1}
      onBlur={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (nextFocused && event.currentTarget.contains(nextFocused)) {
          return;
        }

        onBlur?.();
      }}
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {selected.length > 0 ? (
          selected.map((member) => (
            <Button
              key={member}
              variant="outline"
              className="h-auto gap-1.5 rounded-full border-border bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
              onClick={() => toggleMember(member)}
              disabled={lockedSet.has(member)}
              title={lockedSet.has(member) ? lockedTitle : "Quitar integrante"}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">
                {getPersonInitials(member)}
              </span>
              <span>{member}</span>
              {lockedSet.has(member) ? null : <span className="text-muted-foreground">×</span>}
            </Button>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">{emptyText}</span>
        )}
      </div>

      <Input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="mb-2 h-auto px-2 py-1.5 text-sm"
      />

      <div className="max-h-36 space-y-0.5 overflow-y-auto pr-1">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((member) => {
            const isSelected = selected.includes(member);

            return (
              <Button
                key={member}
                variant="ghost"
                className={`h-auto w-full justify-start gap-2 px-2 py-1.5 text-left text-sm font-normal ${isSelected ? "bg-accent text-accent-foreground hover:bg-accent" : "text-foreground"}`}
                onClick={() => toggleMember(member)}
                disabled={lockedSet.has(member)}
                title={lockedSet.has(member) ? lockedTitle : undefined}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-background ${isSelected ? "bg-foreground" : "bg-muted-foreground/50"}`}
                >
                  {getPersonInitials(member)}
                </span>
                <span className="flex-1">{member}</span>
                <Checkbox checked={isSelected} readOnly tabIndex={-1} />
              </Button>
            );
          })
        ) : (
          <p className="px-2 py-1 text-xs text-muted-foreground">Sin resultados</p>
        )}
      </div>
    </div>
  );
}