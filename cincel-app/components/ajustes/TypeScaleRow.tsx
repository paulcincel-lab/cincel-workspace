"use client";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import type { TypeRole } from "@/lib/types/redesign";

export type TypeScaleRowProps = {
  role: TypeRole;
  label: string;
  value: { size: number; weight: 400 | 500 | 600 };
  min: number;
  max: number;
  onChange(v: { size: number; weight: 400 | 500 | 600 }): void;
};

type Weight = TypeScaleRowProps["value"]["weight"];

/** No weight above 600 (FE §14.3). */
const WEIGHTS: readonly { value: Weight; label: string }[] = [
  { value: 400, label: "Normal" },
  { value: 500, label: "Media" },
  { value: 600, label: "Seminegrita" },
];

const WEIGHT_ITEMS = Object.fromEntries(WEIGHTS.map((w) => [String(w.value), w.label]));

function isWeight(n: number): n is Weight {
  return n === 400 || n === 500 || n === 600;
}

/**
 * One type role row of the theme editor (redesign FE §4.8): size slider within
 * the role's bounds, the value in px and the weight select.
 */
export function TypeScaleRow({ role, label, value, min, max, onChange }: TypeScaleRowProps) {
  const id = `type-${role}`;

  return (
    <SettingsRow
      label={label}
      htmlFor={id}
      control={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={1}
            value={value.size}
            aria-valuetext={`${value.size} px`}
            onChange={(e) => onChange({ ...value, size: Number(e.target.value) })}
            className="w-36 accent-primary"
          />
          <span className="w-12 text-right font-mono text-sm tabular-nums">{value.size}px</span>
          <Select
            items={WEIGHT_ITEMS}
            value={String(value.weight)}
            onValueChange={(next) => {
              const weight = Number(next);
              if (isWeight(weight)) onChange({ ...value, weight });
            }}
          >
            <SelectTrigger aria-label={`Peso de ${label}`} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}
