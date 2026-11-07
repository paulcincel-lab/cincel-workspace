import type { Tone } from "@/lib/types/widgets";

/**
 * Semantic tone the `render_card` / `render_stat_grid` tools send
 * (`lib/assistant/tools.ts` `TONE_ENUM`). The model-facing values stay as they
 * are; the widgets map them onto the library `Tone` and plain shadcn `Badge`
 * variants, so every color comes from the theme tokens.
 */
export type WidgetTone = "ok" | "warning" | "critical";

/** Tool tone → library `Tone` (`lib/types/widgets.ts`). */
export const WIDGET_TONE_TO_TONE: Record<WidgetTone, Tone> = {
  ok: "ok",
  warning: "warn",
  critical: "critical",
};

/** Tool tone → plain shadcn `Badge` variant. */
export const WIDGET_TONE_BADGE_VARIANT: Record<WidgetTone, "success" | "secondary" | "destructive"> = {
  ok: "success",
  warning: "secondary",
  critical: "destructive",
};
