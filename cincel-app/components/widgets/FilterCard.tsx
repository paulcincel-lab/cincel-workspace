"use client";

import type { ReactNode } from "react";

/**
 * Analítico filter card (ADR 0005): square segmented groups, optional search
 * and extra controls. Minimal markup for now: one radiogroup per group.
 * Full behavior in #982.
 */
export type FilterOption = { value: string; label: string; count?: number; color?: string; tone?: "default" | "destructive" };
export type FilterGroup = { id: string; label: string; options: FilterOption[]; value: string };
export type FilterCardProps = {
  groups: FilterGroup[];
  onChange(groupId: string, value: string): void;
  search?: { value: string; onChange(v: string): void; placeholder: string; label: string };
  extra?: ReactNode;
};

export function FilterCard({ groups, onChange, search, extra }: FilterCardProps): ReactNode {
  return (
    <section aria-label="Filtros">
      {groups.map((group) => (
        <div key={group.id} role="radiogroup" aria-label={group.label}>
          {group.options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={option.value === group.value}
              onClick={() => onChange(group.id, option.value)}
            >
              {option.label}
              {option.count !== undefined ? ` ${option.count}` : null}
            </button>
          ))}
        </div>
      ))}
      {search ? (
        <input
          type="search"
          aria-label={search.label}
          placeholder={search.placeholder}
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
        />
      ) : null}
      {extra}
    </section>
  );
}
