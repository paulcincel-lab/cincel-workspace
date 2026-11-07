"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { ChartPie, LayoutGrid, List, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { useStyle } from "@/components/shell/StyleProvider";
import { Button } from "@/components/ui/shadcn/button";
import { updateMyPreferencesAction } from "@/lib/actions/preferences-actions";
import { IMPLEMENTED as PREFERENCES_IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import { actionErrorText } from "@/lib/errors";
import type { PresentationStyle } from "@/lib/types/redesign";
import { PORTAL_STYLE_COOKIE } from "@/lib/ui/preferences";
import { writePortalStyleCookie } from "@/lib/ui/style-override";

/**
 * "Estilo" segmented control (redesign FE §4.2, §16): radiogroup Visual /
 * Esencial / Analítico; reads and writes the style through `useStyle()`.
 *
 * - Arrow keys move and select (Home / End jump), Space or Enter selects the
 *   focused option; one tab stop (roving `tabIndex`).
 * - `scope="staff"` persists through `updateMyPreferencesAction({ style })`
 *   (optimistic, rolls back with a toast on error); `scope="portal"` writes
 *   the `cincel-portal-style` cookie. A `?estilo=` override is a one-render
 *   preview, so a change while overridden is not persisted.
 * - Disabled (still focusable, with the `OVERRIDE_DISABLED` copy) when the
 *   organization fixed the style.
 *
 * Renders no per-style markup (guard allowlist, FE §17).
 */
export type EstiloSwitchProps = { scope?: "staff" | "portal" };

const OPTIONS: { value: PresentationStyle; label: string; icon: LucideIcon }[] = [
  { value: "visual", label: "Visual", icon: ChartPie },
  { value: "esencial", label: "Esencial", icon: List },
  { value: "analitico", label: "Analítico", icon: LayoutGrid },
];

export function EstiloSwitch(props: EstiloSwitchProps) {
  const ctx = useStyle();
  const scope = props.scope ?? ctx.scope;
  const disabled = ctx.isFixed;
  const labelId = useId();
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = ctx.style;
  const currentIndex = Math.max(
    0,
    OPTIONS.findIndex((option) => option.value === current),
  );

  async function persist(next: PresentationStyle, previous: PresentationStyle) {
    if (ctx.isOverridden) return;
    if (scope === "portal") {
      try {
        writePortalStyleCookie(PORTAL_STYLE_COOKIE, next);
      } catch {
        // Cookies blocked: the choice still applies to this page.
      }
      return;
    }
    // Phase 1 stub guard: never call a write stub (FE §9, §20 Rule 1).
    if (!PREFERENCES_IMPLEMENTED.updateMyPreferencesAction) return;
    try {
      await updateMyPreferencesAction({ style: next });
    } catch (err) {
      ctx.setStyle(previous);
      toast.error(actionErrorText(err));
    }
  }

  function select(next: PresentationStyle) {
    if (disabled || next === current) return;
    const previous = current;
    ctx.setStyle(next);
    void persist(next, previous);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = (index + 1) % OPTIONS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = (index - 1 + OPTIONS.length) % OPTIONS.length;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = OPTIONS.length - 1;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        select(OPTIONS[index].value);
        return;
      default:
        return;
    }
    event.preventDefault();
    refs.current[target]?.focus();
    select(OPTIONS[target].value);
  }

  const disabledCopy = disabled ? actionErrorText("OVERRIDE_DISABLED") : null;

  return (
    <div className="flex items-center gap-2" data-slot="estilo-switch">
      <span id={labelId} className="text-xs text-muted-foreground">
        Estilo
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={disabledCopy ? hintId : undefined}
        aria-disabled={disabled || undefined}
        title={disabledCopy ?? undefined}
        className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
      >
        {OPTIONS.map((option, index) => {
          const checked = index === currentIndex;
          const Icon = option.icon;
          return (
            <Button
              key={option.value}
              ref={(el: HTMLButtonElement | null) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={disabled || undefined}
              data-value={option.value}
              tabIndex={checked ? 0 : -1}
              variant={checked ? "secondary" : "ghost"}
              size="sm"
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => select(option.value)}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, index)}
            >
              <Icon aria-hidden="true" strokeWidth={1.8} />
              {option.label}
            </Button>
          );
        })}
      </div>
      {disabledCopy ? (
        <span id={hintId} className="sr-only">
          {disabledCopy}
        </span>
      ) : null}
    </div>
  );
}
