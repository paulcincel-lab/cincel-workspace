/**
 * Text size classes of the appearance (redesign FE §4.1, §14.3). Pure and
 * client-safe.
 *
 * The `text-size-{n}` classes and the `--font-sans` hookup live in a static
 * rule set the root layout renders next to `<style id="appearance">`.
 */
import type { TextSize } from "@/lib/types/redesign";

/** Every allowed text size (BE §3.3 check constraint). */
export const TEXT_SIZES: readonly TextSize[] = [13, 13.5, 14, 14.5, 15, 15.5, 16];

/** `text-size-14`, `text-size-13-5`, …: the class that sets `--text-base` on `<html>`. */
export function textSizeClass(size: TextSize): string {
  return `text-size-${String(size).replace(".", "-")}`;
}

/**
 * Body of `<style id="appearance-base">`. Specificity 0,3,1 for the text-size
 * classes, so the class the client toggles beats the `--text-base` of the
 * `html:root[data-theme=…]` sections (0,2,1). `font-family` follows the
 * resolved `--font-sans` (the selected `next/font` variable), falling back to
 * Geist.
 */
export const APPEARANCE_BASE_CSS: string =
  TEXT_SIZES.map((size) => `html:root[data-theme].${textSizeClass(size)}{--text-base:${size}px}`).join("") +
  "html:root[data-theme]{font-family:var(--font-sans,var(--font-geist-sans)),ui-sans-serif,system-ui,sans-serif}";
