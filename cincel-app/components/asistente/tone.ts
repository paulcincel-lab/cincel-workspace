// Shared semantic-tone → Tailwind classes for the assistant's card/stat-grid
// widgets. Separate from render_chart's blue accent; matches the existing
// Alto/Medio/Bajo risk color convention used elsewhere in the app (emerald =
// good, amber = watch, red = critical).
export type WidgetTone = "ok" | "warning" | "critical";

export const TONE_BADGE_CLASSES: Record<WidgetTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};
