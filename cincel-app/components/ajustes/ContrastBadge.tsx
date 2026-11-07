"use client";

import { CircleAlert, CircleCheck } from "lucide-react";

import { checkContrast } from "@/lib/ui/contrast";
import { formatRatio } from "@/lib/ui/theme-editor";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";

export type ContrastBadgeProps = { pairs: { fg: string; bg: string; label: string }[] };

/** Text pairs need 4.5:1 (FE §14.6). */
const TEXT_MIN = 4.5;

/**
 * Ratio of one resolved color pair through the shared checker: the pair is
 * placed on the `foreground/background` entry of `CONTRAST_PAIRS`, so the
 * badge, the rows and the server always use the same math.
 */
function pairRatio(fg: string, bg: string): number {
  const tokens = {
    ...DEFAULT_ORG_APPEARANCE.tokens,
    foreground: { light: fg, dark: fg },
    background: { light: bg, dark: bg },
  };
  const result = checkContrast(tokens, "light").find((r) => r.pair === "foreground/background");
  return result ? result.ratio : 0;
}

/**
 * Worst contrast ratio of the given pairs (redesign FE §4.8, §14.6):
 * "Contraste texto / fondo: {r}:1 · cumple 4.5:1", or the failing pair.
 */
export function ContrastBadge({ pairs }: ContrastBadgeProps) {
  if (pairs.length === 0) return null;
  const rated = pairs.map((p) => ({ ...p, ratio: pairRatio(p.fg, p.bg) }));
  const worst = rated.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const ok = worst.ratio >= TEXT_MIN;
  const ratio = formatRatio(worst.ratio);

  return (
    <p role="status" data-ok={ok ? "true" : "false"} className="flex items-start gap-2 text-sm">
      {ok ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      {ok ? (
        <span>
          Contraste texto / fondo: <strong className="font-semibold">{ratio}:1</strong> · cumple 4.5:1
        </span>
      ) : (
        <span className="text-destructive">
          Contraste {worst.label}: <strong className="font-semibold">{ratio}:1</strong> · no cumple 4.5:1
        </span>
      )}
    </p>
  );
}
