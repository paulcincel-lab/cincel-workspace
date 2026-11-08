"use client";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { Badge } from "@/components/ui/shadcn/badge";
import { Input } from "@/components/ui/shadcn/input";
import type { TokenName } from "@/lib/types/redesign";

export type TokenRowProps = {
  name: TokenName;
  label: string;
  value: string;
  onChange(hex: string): void;
  /** Contrast message when the token takes part in a failing pair (the row is marked). */
  invalid?: string;
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

/**
 * One token row of the theme editor (redesign FE §4.8): color input + label +
 * `--name` + value chip, as a `SettingsRow`: one swatch control per token.
 */
export function TokenRow({ name, label, value, onChange, invalid }: TokenRowProps) {
  const id = `token-${name}`;
  const messageId = `${id}-contrast`;
  const parsed = parseTokenColor(value);

  return (
    <div data-token={name} data-invalid={invalid ? "true" : undefined}>
      <SettingsRow
        label={label}
        description={`--${name}`}
        htmlFor={id}
        control={
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <Badge variant={invalid ? "destructive" : "outline"} className="font-mono">
                {value}
              </Badge>
              <Input
                id={id}
                type="color"
                value={parsed.hex}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={invalid ? messageId : undefined}
                onChange={(e) => onChange(withTokenAlpha(e.target.value, parsed.alpha))}
                className="h-8 w-12 cursor-pointer p-1"
              />
            </div>
            {invalid ? (
              <p id={messageId} className="text-xs text-destructive">
                {invalid}
              </p>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
