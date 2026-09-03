"use client";

import { useEffect, useRef, useState } from "react";

import type { ExportFormat } from "@/lib/utils/export-service";

type ExportMenuProps = {
  disabled?: boolean;
  onExport: (format: ExportFormat) => void | Promise<void>;
  scaleClassName?: string;
};

export default function ExportMenu({ disabled = false, onExport, scaleClassName = "scale-[0.84]" }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
    };
  }, []);

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
    <div ref={containerRef} className={`relative origin-top-right ${scaleClassName}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || isExporting}
        className={`rounded-lg border px-4 py-2 text-sm font-medium ${disabled || isExporting ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
      >
        {isExporting ? "Exportando..." : "Exportar ▼"}
      </button>

      {open && !disabled ? (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              void handleExport("xlsx");
            }}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Exportar a Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => {
              void handleExport("pdf");
            }}
            className="block w-full border-t border-slate-100 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Exportar a PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
