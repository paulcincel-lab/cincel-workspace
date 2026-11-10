"use client";

import { useState } from "react";

import { TokenContrastBadge } from "@/components/ajustes/ContrastBadge";
import type { TokenName } from "@/lib/types/redesign";
import type { TokenContrast } from "@/lib/ui/theme-editor";

export type TokenRowProps = {
  name: TokenName;
  label: string;
  value: string;
  onChange(hex: string): void;
  /** Contrast message when the token takes part in a failing pair (the row is marked). */
  invalid?: string;
  /** The row's contrast badge (`tokenContrast`); none when the token is in no `CONTRAST_PAIRS` entry. */
  contrast?: TokenContrast | null;
};

type ParsedColor = { hex: string; alpha: number | null };

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

/** A token value as the `#rrggbb` a color input takes, plus its alpha when the value is `rgba(...)`. */
export function parseTokenColor(value: string): ParsedColor {
  const v = value.trim();
  if (HEX6.test(v)) return { hex: v.toLowerCase(), alpha: null };
  const short = HEX3.exec(v);
  if (short) return { hex: `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase(), alpha: null };
  const rgb = RGB.exec(v);
  if (rgb) {
    const hex = `#${toHexByte(Number(rgb[1]))}${toHexByte(Number(rgb[2]))}${toHexByte(Number(rgb[3]))}`;
    return { hex, alpha: rgb[4] === undefined ? null : Number(rgb[4]) };
  }
  return { hex: "#000000", alpha: null };
}

/** The picked `#rrggbb`, keeping the alpha of an `rgba(...)` token. */
export function withTokenAlpha(hex: string, alpha: number | null): string {
  if (alpha === null) return hex.toLowerCase();
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** A value the hex chip accepts: `#rgb`, `#rrggbb` or `rgb(a)(…)`. */
export function isTokenColor(value: string): boolean {
  const v = value.trim();
  return HEX6.test(v) || HEX3.test(v) || RGB.test(v);
}

/**
 * One token row of the theme editor (canvas `Ajustes-Tema`, `.tok`): a 22 px
 * swatch that opens the color picker, the Spanish name, the contrast badge
 * and the editable hex chip (Geist Mono). The chip commits a value once it is
 * a full color (`#rrggbb` or `rgb(a)`); on blur `#rgb` is expanded and an
 * invalid text goes back to the token value.
 */
export function TokenRow({ name, label, value, onChange, invalid, contrast }: TokenRowProps) {
  const id = `token-${name}`;
  const messageId = `${id}-contrast`;
  const parsed = parseTokenColor(value);
  /** What is typed in the chip while it is being edited; null shows the token value. */
  const [text, setText] = useState<string | null>(null);

  return (
    <div
      data-token={name}
      data-invalid={invalid ? "true" : undefined}
      className="flex flex-wrap items-center gap-2.5 border-b border-muted py-[7px] text-[13px] last:border-b-0"
    >
      <input
        id={id}
        type="color"
        value={parsed.hex}
        aria-label={`Color de ${label}`}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? messageId : undefined}
        onChange={(e) => onChange(withTokenAlpha(e.target.value, parsed.alpha))}
        className="size-[22px] shrink-0 cursor-pointer appearance-none rounded-md border border-input bg-transparent p-0 [&::-moz-color-swatch]:rounded-[5px] [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <span className="min-w-0 flex-1 text-foreground">{label}</span>
      {contrast ? <TokenContrastBadge contrast={contrast} /> : null}
      <input
        type="text"
        spellCheck={false}
        aria-label={`Valor de ${label}`}
        value={text ?? value}
        onChange={(e) => {
          setText(e.target.value);
          const next = e.target.value.trim();
          if (HEX6.test(next) || RGB.test(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => {
          const next = (text ?? "").trim();
          if (HEX3.test(next)) onChange(parseTokenColor(next).hex);
          setText(null);
        }}
        className="w-[7.5rem] shrink-0 rounded-lg border border-border bg-transparent px-2 py-[3px] font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {invalid ? (
        <p id={messageId} className="sr-only">
          {invalid}
        </p>
      ) : null}
    </div>
  );
}
