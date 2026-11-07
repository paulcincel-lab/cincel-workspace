/**
 * `npm run themes:css` (redesign BE §5.3, §15): regenerates the token block of
 * `app/globals.css` from `THEME_PRESETS.azul`. Not run until Phase 9 (Cleanup);
 * until then `globals.css` keeps today's values.
 *
 * Contract stub.
 */
import { notImplemented } from "@/lib/stubs";

export function themesCss(): string {
  return notImplemented("themesCss");
}

if (process.argv[1]?.endsWith("themes-css.ts")) {
  themesCss();
}
