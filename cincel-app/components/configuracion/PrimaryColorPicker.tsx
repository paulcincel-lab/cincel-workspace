"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { savePrimaryColorAction } from "@/lib/actions/app-settings-actions";
import {
  PRIMARY_COLOR_FAMILIES,
  PRIMARY_COLOR_SHADES,
  primaryColorValue,
  type PrimaryColorToken,
} from "@/lib/theme/primary-color";

interface PrimaryColorPickerProps {
  value: PrimaryColorToken | null;
  canManage: boolean;
}

/** Company-wide primary color from the Tailwind palette; saved on pick, applied app-wide. */
export function PrimaryColorPicker({ value, canManage }: PrimaryColorPickerProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(token: PrimaryColorToken | null) {
    setError(null);
    startTransition(async () => {
      try {
        await savePrimaryColorAction(token);
        setCurrent(token);
        setOpen(false);
        router.refresh();
      } catch {
        setError("No se pudo guardar el color.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" disabled={!canManage || pending} aria-label="Elegir color principal" />
            }
          >
            <span
              className="size-4 rounded-sm border border-border"
              style={{ backgroundColor: current ? primaryColorValue(current) : "#0a0a0a" }}
            />
            {current ?? "Predeterminado (negro)"}
          </PopoverTrigger>
          <PopoverContent className="max-h-96 overflow-y-auto p-3">
            <div className="grid grid-cols-[auto_repeat(11,1.25rem)] items-center gap-1">
              <span />
              {PRIMARY_COLOR_SHADES.map((shade) => (
                <span key={shade} className="text-center text-[9px] text-muted-foreground">
                  {shade}
                </span>
              ))}
              {PRIMARY_COLOR_FAMILIES.map((family) => (
                <div key={family} className="contents">
                  <span className="pr-2 text-xs text-muted-foreground">{family}</span>
                  {PRIMARY_COLOR_SHADES.map((shade) => {
                    const token: PrimaryColorToken = `${family}-${shade}`;
                    const selected = token === current;
                    return (
                      <button
                        key={token}
                        type="button"
                        aria-label={token}
                        aria-pressed={selected}
                        title={token}
                        onClick={() => save(token)}
                        className="size-5 rounded-sm border border-border outline-offset-1 aria-pressed:outline-2 aria-pressed:outline-foreground"
                        style={{ backgroundColor: primaryColorValue(token) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="sm" onClick={() => save(null)} disabled={!canManage || pending || !current}>
          Restaurar
        </Button>
      </div>
      {!canManage ? (
        <p className="text-[11px] text-muted-foreground">Solo un administrador puede cambiar el color principal.</p>
      ) : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
