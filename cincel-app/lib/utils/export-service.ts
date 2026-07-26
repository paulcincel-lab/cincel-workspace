export type ExportFormat = "xlsx" | "pdf";

export type ExportValue = string | number | boolean | Date | null | undefined;

export type ExportColumn<TRow> = {
  key: string;
  header: string;
  isDate?: boolean;
  getValue: (row: TRow) => ExportValue;
};

export type ExportRequest<TRow> = {
  moduleName: string;
  fileName: string;
  format: ExportFormat;
  companyName: string;
  columns: Array<ExportColumn<TRow>>;
  rows: TRow[];
  generatedAt?: Date;
  landscape?: boolean;
};

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-");
  return safe || "export";
}

function parseAsDate(value: ExportValue): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month - 1, day, 12, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCellValue(value: ExportValue, isDate: boolean): string | number | boolean | Date {
  if (isDate) {
    const parsed = parseAsDate(value);
    if (parsed) {
      return parsed;
    }
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value;
  }

  return String(value);
}

function toDisplayValue(value: string | number | boolean | Date): string {
  if (value instanceof Date) {
    return value.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  return String(value);
}

function buildMatrix<TRow>(columns: Array<ExportColumn<TRow>>, rows: TRow[]): Array<Array<string | number | boolean | Date>> {
  return rows.map((row) =>
    columns.map((column) => {
      const raw = column.getValue(row);
      return normalizeCellValue(raw, Boolean(column.isDate));
    })
  );
}

async function exportToExcel<TRow>(request: ExportRequest<TRow>): Promise<void> {
  const XLSX = await import("xlsx");

  const headers = request.columns.map((column) => column.header);
  const body = buildMatrix(request.columns, request.rows);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body], { cellDates: true });

  worksheet["!cols"] = request.columns.map(() => ({ wch: 24 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, request.moduleName.slice(0, 31) || "Export");
  XLSX.writeFile(workbook, `${sanitizeFileName(request.fileName)}.xlsx`, {
    cellDates: true,
  });
}

async function exportToPdf<TRow>(request: ExportRequest<TRow>): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const generatedAt = request.generatedAt ?? new Date();
  const document = new jsPDF({
    orientation: request.landscape ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  const headers = request.columns.map((column) => column.header);
  const body = buildMatrix(request.columns, request.rows).map((row) => row.map((cell) => toDisplayValue(cell)));

  document.setFontSize(14);
  document.text(request.moduleName, 40, 42);

  document.setFontSize(9);
  document.setTextColor(80);
  document.text(`Empresa: ${request.companyName}`, 40, 58);
  document.text(`Generado: ${generatedAt.toLocaleString("es-MX")}`, 40, 72);

  autoTable(document, {
    startY: 86,
    head: [headers],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    margin: { left: 40, right: 40 },
  });

  document.save(`${sanitizeFileName(request.fileName)}.pdf`);
}

export async function exportTableData<TRow>(request: ExportRequest<TRow>): Promise<void> {
  if (request.format === "xlsx") {
    await exportToExcel(request);
    return;
  }

  await exportToPdf(request);
}
