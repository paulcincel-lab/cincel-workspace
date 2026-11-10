"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { ChartPie, LayoutGrid, List, type LucideIcon } from "lucide-react";

import { useStyle } from "@/components/shell/StyleProvider";
import { Button } from "@/components/ui/shadcn/button";
import { IMPLEMENTED as PREFERENCES_IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { useAppearanceStoreApiOrNull } from "@/lib/stores/appearance-store";
import type { PresentationStyle } from "@/lib/types/redesign";
import { PORTAL_STYLE_COOKIE } from "@/lib/ui/preferences";
import { ESTILO_PARAM, writePortalStyleCookie } from "@/lib/ui/style-override";

/**
 * "Estilo" segmented control (redesign FE §4.2, §16): radiogroup Visual /
 * Esencial / Analítico; reads and writes the style through `useStyle()`.
 *
 * - Arrow keys move and select (Home / End jump), Space or Enter selects the
 *   focused option; one tab stop (roving `tabIndex`).
 * - `scope="staff"` writes the appearance store with
 *   `setPreference({ style })`: applied at once (store and `html[data-style]`,
 *   so every page reads it), persisted with `updateMyPreferencesAction`,
 *   rolled back with a toast on error. `scope="portal"` writes the
 *   `cincel-portal-style` cookie.
 * - A `?estilo=` override is a preview: a change while it is active swaps
 *   the URL parameter in place (no navigation) and is not persisted.
 * - Staff: hidden when the organization fixed the style (`fixedByOrg`; the
 *   override is ignored then). Portal: disabled (still focusable, with the
 *   `OVERRIDE_DISABLED` copy).
 *
 * Renders no per-style markup (guard allowlist, FE §17).
 */
export type EstiloSwitchProps = {
  scope?: "staff" | "portal";
  /** `segmented`: no visible "Estilo" label (kept for screen readers), active option in `primary` (portal top bar). */
  variant?: "default" | "segmented";
};

const OPTIONS: { value: PresentationStyle; label: string; icon: LucideIcon }[] = [
  { value: "visual", label: "Visual", icon: ChartPie },
  { value: "esencial", label: "Esencial", icon: List },
  { value: "analitico", label: "Analítico", icon: LayoutGrid },
];

/** Swaps `?estilo=` in the address bar without a navigation (Next syncs `useSearchParams`). */
function replaceEstiloParam(style: PresentationStyle): void {
  const url = new URL(window.location.href);
  url.searchParams.set(ESTILO_PARAM, style);
  window.history.replaceState(window.history.state, "", url);
}

export function EstiloSwitch(props: EstiloSwitchProps) {
  const ctx = useStyle();
  const store = useAppearanceStoreApiOrNull();
  const scope = props.scope ?? ctx.scope;
  const disabled = ctx.isFixed;
  const labelId = useId();
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const segmented = props.variant === "segmented";
  const current = ctx.style;
  const currentIndex = Math.max(
    0,
    OPTIONS.findIndex((option) => option.value === current),
  );

  function select(next: PresentationStyle) {
    if (disabled || next === current) return;
    if (scope === "portal") {
      ctx.setStyle(next);
      try {
        writePortalStyleCookie(PORTAL_STYLE_COOKIE, next);
      } catch {
        // Cookies blocked: the choice still applies to this page.
      }
      return;
    }
    if (ctx.isOverridden) {
      // A preview: a store seeded for it changes in place; the `?estilo=` override follows the
      // address bar and never touches the shared store, so other pages keep the saved style.
      if (store?.getState().isStyleOverridden === true) ctx.setStyle(next);
      else replaceEstiloParam(next);
      return;
    }
    // Phase 1 stub guard: never call a write stub (FE §9, §20 Rule 1).
    if (!PREFERENCES_IMPLEMENTED.updateMyPreferencesAction || !store) {
      ctx.setStyle(next);
      return;
    }
    // Optimistic in the store and on <html>; rolls back with the error toast.
    void store.getState().setPreference({ style: next });
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

  // Staff: the organization fixed the style, so there is nothing to switch.
  if (disabled && scope === "staff") return null;

  return (
    <div className="flex items-center gap-2" data-slot="estilo-switch">
      <span id={labelId} className={segmented ? "sr-only" : "text-xs text-muted-foreground"}>
        Estilo
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={disabledCopy ? hintId : undefined}
        aria-disabled={disabled || undefined}
        title={disabledCopy ?? undefined}
        className={
          segmented
            ? "inline-flex items-center gap-0.5 rounded-[10px] border border-border bg-muted/50 p-0.5"
            : "inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
        }
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
              variant={checked ? (segmented ? "default" : "secondary") : "ghost"}
              size="sm"
              className={
                segmented
                  ? "rounded-lg px-3 text-[13px] font-medium aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:hidden"
                  : "aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              }
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
