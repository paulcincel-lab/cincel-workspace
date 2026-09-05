"use client";

import { useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import type { ExportFormat } from "@/lib/utils/export-service";

type ExportMenuProps = {
  disabled?: boolean;
  onExport: (format: ExportFormat) => void | Promise<void>;
  scaleClassName?: string;
};

export default function ExportMenu({ disabled = false, onExport, scaleClassName = "scale-[0.84]" }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat) => {
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
        <Button
          variant="ghost"
          onClick={() => {
            void handleExport("xlsx");
          }}
          className="block h-auto w-full rounded-none px-4 py-2 text-left text-sm font-normal"
        >
          Exportar a Excel (.xlsx)
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void handleExport("pdf");
          }}
          className="block h-auto w-full rounded-none border-t border-border px-4 py-2 text-left text-sm font-normal"
        >
          Exportar a PDF
        </Button>
      </PopoverContent>
    </Popover>
  );
}
