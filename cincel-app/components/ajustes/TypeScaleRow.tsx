"use client";

import { Input } from "@/components/ui/shadcn/input";
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
export const WEIGHTS: readonly { value: Weight; label: string }[] = [
  { value: 400, label: "Normal" },
  { value: 500, label: "Media" },
  { value: 600, label: "Seminegrita" },
];

const WEIGHT_ITEMS = Object.fromEntries(WEIGHTS.map((w) => [String(w.value), w.label]));

function isWeight(n: number): n is Weight {
  return n === 400 || n === 500 || n === 600;
}

/** Grid of the "Tipografía" table (canvas `Ajustes-Tema`): ROL · TAMAÑO · PESO. */
export const TYPE_SCALE_GRID = "grid grid-cols-[1.4fr_1fr_1fr] items-center gap-x-3 gap-y-1.5";

/** Clamps a typed size to the role's bounds, in 0.5 px steps. */
export function clampSize(raw: number, min: number, max: number): number {
  if (!Number.isFinite(raw)) return min;
  return Math.min(max, Math.max(min, Math.round(raw * 2) / 2));
}

/**
 * One type role row of the theme editor (canvas `Ajustes-Tema`): the role,
 * a px number stepper within the role's bounds and the weight select
 * ("Normal" 400, "Media" 500, "Seminegrita" 600; nothing above 600).
 */
export function TypeScaleRow({ role, label, value, min, max, onChange }: TypeScaleRowProps) {
  const id = `type-${role}`;

  return (
    <div data-slot="type-scale-row" data-role={role} className={TYPE_SCALE_GRID}>
      <label htmlFor={id} className="text-[13px] text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={0.5}
          value={value.size}
          aria-label={`Tamaño de ${label} en px`}
          onChange={(e) => {
            if (e.target.value === "") return;
            onChange({ ...value, size: clampSize(Number(e.target.value), min, max) });
          }}
          className="h-8 w-20 font-mono"
        />
        <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
          px
        </span>
      </div>
      <Select
        items={WEIGHT_ITEMS}
        value={String(value.weight)}
        onValueChange={(next) => {
          const weight = Number(next);
          if (isWeight(weight)) onChange({ ...value, weight });
        }}
      >
        <SelectTrigger aria-label={`Peso de ${label}`} className="w-full">
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
  );
}
