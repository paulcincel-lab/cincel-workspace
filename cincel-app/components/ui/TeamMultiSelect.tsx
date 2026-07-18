"use client";

import { useMemo, useState } from "react";

type Props = {
  options: string[];
  selected: string[];
  onChange: (members: string[]) => void;
  placeholder?: string;
  onBlur?: () => void;
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
    return <span className="text-black">Sin equipo</span>;
  }

  const visibleMembers = members.slice(0, 2);
  const remaining = members.length - visibleMembers.length;

  return (
    <div className="flex items-center gap-1">
      {visibleMembers.map((member) => (
        <span
          key={member}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
          title={member}
        >
          {getPersonInitials(member)}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="inline-flex h-6 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600">
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}

export default function TeamMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Buscar colaborador...",
  onBlur,
}: Props) {
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const lowered = query.toLowerCase();
    return options.filter((member) =>
      member.toLowerCase().includes(lowered)
    );
  }, [options, query]);

  const toggleMember = (member: string) => {
    if (selected.includes(member)) {
      onChange(selected.filter((item) => item !== member));
      return;
    }

    onChange([...selected, member]);
  };

  return (
    <div
      className="w-full rounded-xl border border-slate-200 bg-white p-2"
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
            <button
              key={member}
              type="button"
              onClick={() => toggleMember(member)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
              title="Quitar integrante"
            >
              <span>{getPersonInitials(member)}</span>
              <span>×</span>
            </button>
          ))
        ) : (
          <span className="text-xs text-slate-400">Sin integrantes asignados</span>
        )}
      </div>

      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      />

      <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((member) => {
            const isSelected = selected.includes(member);

            return (
              <button
                key={member}
                type="button"
                onClick={() => toggleMember(member)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${isSelected ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}
              >
                <span>{member}</span>
                <span className="text-xs">{isSelected ? "✓" : "+"}</span>
              </button>
            );
          })
        ) : (
          <p className="px-2 py-1 text-xs text-slate-400">Sin resultados</p>
        )}
      </div>
    </div>
  );
}