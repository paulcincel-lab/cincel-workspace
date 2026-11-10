"use client";

import { useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import type { ExportFormat } from "@/lib/utils/export-service";

/** What the menu can offer: the export service's formats plus a CSV the caller builds. */
export type ExportMenuFormat = ExportFormat | "csv";

const FORMAT_LABELS: Record<ExportMenuFormat, string> = {
  xlsx: "Exportar a Excel (.xlsx)",
  pdf: "Exportar a PDF",
  csv: "Exportar a CSV (.csv)",
};

const DEFAULT_FORMATS: readonly ExportFormat[] = ["xlsx", "pdf"];

type ExportMenuProps<F extends ExportMenuFormat = ExportFormat> = {
  disabled?: boolean;
  onExport: (format: F) => void | Promise<void>;
  scaleClassName?: string;
  /** Menu entries, in order; default Excel and PDF. */
  formats?: readonly F[];
};

export default function ExportMenu<F extends ExportMenuFormat = ExportFormat>({
  disabled = false,
  onExport,
  scaleClassName = "scale-[0.84]",
  formats = DEFAULT_FORMATS as readonly F[],
}: ExportMenuProps<F>) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: F) => {
    try {
      setIsExporting(true);
      await onExport(format);
    } finally {
      setIsExporting(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled || isExporting}
        className={`origin-top-right ${scaleClassName} rounded-lg border px-4 py-2 text-sm font-medium ${disabled || isExporting ? "cursor-not-allowed border-border bg-muted text-muted-foreground/60" : "border-border bg-background text-foreground hover:bg-muted"}`}
      >
        {isExporting ? "Exportando..." : "Exportar ▼"}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-56 overflow-hidden p-0">
        {formats.map((format, index) => (
          <Button
            key={format}
            variant="ghost"
            onClick={() => {
              void handleExport(format);
            }}
            className={`block h-auto w-full rounded-none px-4 py-2 text-left text-sm font-normal${index > 0 ? " border-t border-border" : ""}`}
          >
            {FORMAT_LABELS[format]}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
