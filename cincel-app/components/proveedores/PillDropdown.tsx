"use client";

import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";

/** Predefined color swatches for option badges. */
export const COLOR_PALETTE: { label: string; bg: string; text: string }[] = [
  { label: "Verde",         bg: "#10b981", text: "#ffffff" },
  { label: "Verde oscuro",  bg: "#065f46", text: "#ffffff" },
  { label: "Azul",          bg: "#3b82f6", text: "#ffffff" },
  { label: "Azul marino",   bg: "#1e3a5f", text: "#ffffff" },
  { label: "Cyan",          bg: "#06b6d4", text: "#1f2937" },
  { label: "Naranja",       bg: "#f97316", text: "#ffffff" },
  { label: "Amarillo",      bg: "#eab308", text: "#1f2937" },
  { label: "Rojo",          bg: "#ef4444", text: "#ffffff" },
  { label: "Rojo oscuro",   bg: "#991b1b", text: "#ffffff" },
  { label: "Púrpura",       bg: "#a855f7", text: "#ffffff" },
  { label: "Índigo",        bg: "#4f46e5", text: "#ffffff" },
  { label: "Rosa",          bg: "#ec4899", text: "#ffffff" },
  { label: "Café",          bg: "#92400e", text: "#ffffff" },
  { label: "Verde lima",    bg: "#65a30d", text: "#ffffff" },
  { label: "Gris",          bg: "#6b7280", text: "#ffffff" },
  { label: "Gris claro",    bg: "#d1d5db", text: "#374151" },
];

/**
 * Pill-shaped dropdown for selecting a single option from a configurable list.
 * Supports adding/removing options and per-option custom colors.
 */
export const PillDropdown = ({
  value, options, colorFn, onSave, onAddOption, onDeleteOption,
  optionColors, onSetColor,
}: {
  value: string;
  options: string[];
  colorFn: (v: string) => string;
  onSave: (v: string) => void;
  onAddOption?: (v: string) => void;
  onDeleteOption?: (v: string) => void;
  optionColors?: Record<string, { bg: string; text: string }>;
  onSetColor?: (option: string, color: { bg: string; text: string }) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const [newColor, setNewColor] = useState<{ bg: string; text: string } | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const effectiveStyle = (opt: string): { className?: string; style?: React.CSSProperties } => {
    const custom = optionColors?.[opt];
    if (custom) return { style: { backgroundColor: custom.bg, color: custom.text } };
    return { className: colorFn(opt) };
  };

  const pillStyle = effectiveStyle(value);
  const close = () => { setOpen(false); setAdding(false); setPickingFor(null); setNewColor(null); };

  return (
    <Popover open={open} onOpenChange={(next) => { if (next) setOpen(true); else close(); }}>
      <PopoverTrigger
        className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition ${pillStyle.className ?? ""}`}
        style={pillStyle.style}
      >
        {value || "—"}
      </PopoverTrigger>

      <PopoverContent align="start" className="overflow-hidden">
            {pickingFor && onSetColor ? (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600 truncate max-w-[130px]">{pickingFor}</span>
                  <Button variant="link" onClick={() => setPickingFor(null)} className="h-auto p-0 text-xs">← Atrás</Button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {/* Color swatches: pure style={backgroundColor} squares, no text —
                      shadcn Button's text-oriented defaults don't fit; kept as plain buttons. */}
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.bg}
                      type="button"
                      title={c.label}
                      onClick={() => { onSetColor(pickingFor, { bg: c.bg, text: c.text }); setPickingFor(null); }}
                      className="w-8 h-8 rounded-md border-2 border-white hover:border-gray-400 transition shadow-sm"
                      style={{ backgroundColor: c.bg }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="max-h-52 overflow-y-auto">
                  {options.map((opt) => {
                    const s = effectiveStyle(opt);
                    return (
                      <div key={opt} className={`flex items-center group px-2 py-1.5 hover:bg-gray-50 ${value === opt ? "bg-gray-50" : ""}`}>
                        <Button
                          variant="ghost"
                          onClick={() => { onSave(opt); close(); }}
                          className="h-auto flex-1 justify-start gap-2 p-0 text-left text-sm font-normal"
                        >
                          <span
                            className={`w-3 h-3 rounded-sm flex-shrink-0 ${s.className ? s.className.split(" ")[0] : ""}`}
                            style={s.style ? { backgroundColor: s.style.backgroundColor as string } : undefined}
                          />
                          <span className={value === opt ? "font-semibold" : ""}>{opt}</span>
                        </Button>
                        {onSetColor && (
                          <Button
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setPickingFor(opt); }}
                            className="h-auto opacity-0 group-hover:opacity-100 p-0.5 text-xs text-gray-300 hover:text-blue-500"
                            title="Cambiar color"
                          >🎨</Button>
                        )}
                        {onDeleteOption && (
                          <Button
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); onDeleteOption(opt); }}
                            className="h-auto opacity-0 group-hover:opacity-100 p-0.5 text-xs text-gray-300 hover:text-red-500"
                            title="Eliminar opción"
                          >✕</Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {onAddOption && (
                  <div className="border-t border-gray-100 p-2">
                    {!adding ? (
                      <Button variant="link" onClick={() => setAdding(true)} className="h-auto w-full justify-start p-1 text-xs">
                        + Agregar opción
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          autoFocus
                          type="text"
                          value={newVal}
                          onChange={(e) => setNewVal(e.target.value)}
                          placeholder="Nueva opción…"
                          className="h-auto py-1.5 text-xs"
                        />
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Color:</p>
                          <div className="flex flex-wrap gap-1">
                            {/* Color swatches: pure style={backgroundColor} squares, no text —
                                shadcn Button's text-oriented defaults don't fit; kept as plain buttons. */}
                            {COLOR_PALETTE.map((c) => (
                              <button
                                key={c.bg}
                                type="button"
                                title={c.label}
                                onClick={() => setNewColor(c)}
                                className="w-5 h-5 rounded-sm border-2 transition"
                                style={{
                                  backgroundColor: c.bg,
                                  borderColor: newColor?.bg === c.bg ? "#1d4ed8" : "transparent",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {newColor && (
                            <span
                              className="px-2 py-0.5 rounded-md text-xs font-semibold"
                              style={{ backgroundColor: newColor.bg, color: newColor.text }}
                            >
                              {newVal || "Vista previa"}
                            </span>
                          )}
                          <div className="flex gap-1 ml-auto">
                            <Button
                              size="sm"
                              onClick={() => {
                                if (newVal.trim()) {
                                  onAddOption(newVal.trim());
                                  if (newColor && onSetColor) onSetColor(newVal.trim(), newColor);
                                  setNewVal(""); setAdding(false); setNewColor(null);
                                }
                              }}
                              className="h-auto px-2 py-1 text-xs"
                            >✓</Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => { setAdding(false); setNewColor(null); setNewVal(""); }}
                              className="h-auto px-2 py-1 text-xs"
                            >✕</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
      </PopoverContent>
    </Popover>
  );
};
