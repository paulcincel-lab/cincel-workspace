"use client";

import { type ReactNode, useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/shadcn/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/shadcn/table";
import { getImportDataAction } from "@/lib/actions/import-actions";
import type { ImportDataEntity } from "@/lib/repositories/import-repository";
import type { ImportData } from "@/lib/types/core";
import { formatDateDMY } from "@/lib/utils/date";

export type ImportDataRow = { label: string; value: ReactNode };

export type ImportDataSubitem = {
  id: string;
  name: string;
  rows: ImportDataRow[];
};

const URL_PATTERN = /^https?:\/\/\S+$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatScalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function renderText(text: string, key?: number): ReactNode {
  return URL_PATTERN.test(text.trim()) ? (
    <a key={key} href={text.trim()} target="_blank" rel="noreferrer">
      {text.trim()}
    </a>
  ) : (
    text
  );
}

/**
 * A column value as shown in the panel: strings as text, arrays joined with
 * ", ", URLs as links. `null` when there's nothing to show.
 */
export function formatImportValue(value: unknown): ReactNode | null {
  if (Array.isArray(value)) {
    const parts = value
      .map(formatScalar)
      .filter((part): part is string => part !== null);
    if (parts.length === 0) return null;
    if (!parts.some((part) => URL_PATTERN.test(part.trim()))) {
      return parts.join(", ");
    }
    return parts.flatMap((part, i) =>
      i === 0 ? [renderText(part, i)] : [", ", renderText(part, i)],
    );
  }
  const text = formatScalar(value);
  return text === null ? null : renderText(text);
}

function columnRows(columns: unknown): ImportDataRow[] {
  if (!isRecord(columns)) return [];
  const rows: ImportDataRow[] = [];
  for (const [label, raw] of Object.entries(columns)) {
    const value = formatImportValue(raw);
    if (value !== null) rows.push({ label, value });
  }
  return rows;
}

/** The item's own rows: its columns, then Inicio, Hito and the monday path. */
export function importDataRows(data: Record<string, unknown>): ImportDataRow[] {
  const rows = columnRows(data.columns);
  if (typeof data.start === "string" && data.start.trim() !== "") {
    rows.push({ label: "Inicio", value: formatDateDMY(data.start) });
  }
  if (data.milestone === true) rows.push({ label: "Hito", value: "Sí" });
  if (Array.isArray(data.path)) {
    const path = data.path.filter(
      (part): part is string => typeof part === "string" && part !== "",
    );
    if (path.length > 0) rows.push({ label: "Ruta", value: path.join(" › ") });
  }
  return rows;
}

/** Checklist-mode subitems (`data.subitems[<id>] = { name, columns }`), in stored order. */
export function importDataSubitems(
  data: Record<string, unknown>,
): ImportDataSubitem[] {
  if (!isRecord(data.subitems)) return [];
  const subitems: ImportDataSubitem[] = [];
  for (const [id, raw] of Object.entries(data.subitems)) {
    if (!isRecord(raw)) continue;
    const rows = columnRows(raw.columns);
    if (rows.length === 0) continue;
    const name =
      typeof raw.name === "string" && raw.name.trim() !== ""
        ? raw.name
        : `Subelemento ${id}`;
    subitems.push({ id, name, rows });
  }
  return subitems;
}

function localDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return formatDateDMY(
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  );
}

/** "Importado de monday el {fecha} · tablero {boardName} · grupo {groupTitle}". */
export function importDataFooter(importData: ImportData): string {
  const parts = [`Importado de monday el ${localDate(importData.importedAt)}`];
  if (importData.boardName) parts.push(`tablero ${importData.boardName}`);
  if (importData.groupTitle) parts.push(`grupo ${importData.groupTitle}`);
  return parts.join(" · ");
}

/** True when the panel has something to show for this import data. */
export function hasImportData(importData: ImportData | null): boolean {
  if (!importData) return false;
  return (
    importDataRows(importData.data).length > 0 ||
    importDataSubitems(importData.data).length > 0
  );
}

function RowsTable({ rows }: { rows: ImportDataRow[] }) {
  return (
    <Table>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableHead className="w-1/3 align-top whitespace-normal">
              {row.label}
            </TableHead>
            <TableCell className="align-top whitespace-normal">
              {row.value}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Read-only "Datos de monday" accordion (monday-migration FE §2.3): the
 * untranslated values an import kept for a task, project or contact.
 * Presentational; renders nothing without data.
 */
export function ImportDataPanel({
  importData,
}: {
  importData: ImportData | null;
}) {
  if (!importData || !hasImportData(importData)) return null;
  const rows = importDataRows(importData.data);
  const subitems = importDataSubitems(importData.data);

  return (
    <Accordion>
      <AccordionItem value="import-data">
        <AccordionTrigger>Datos de monday</AccordionTrigger>
        <AccordionContent className="space-y-4">
          {rows.length > 0 ? <RowsTable rows={rows} /> : null}
          {subitems.map((subitem) => (
            <div key={subitem.id} className="space-y-1">
              <h4 className="font-medium text-foreground">{subitem.name}</h4>
              <RowsTable rows={subitem.rows} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {importDataFooter(importData)}
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** Loads a row's import data with `getImportDataAction`; `null` until loaded or when absent. */
export function useImportData(
  entity: ImportDataEntity,
  rowId: string | null | undefined,
): ImportData | null {
  const [loaded, setLoaded] = useState<{
    key: string;
    data: ImportData | null;
  } | null>(null);
  const key = rowId ? `${entity}:${rowId}` : null;

  useEffect(() => {
    if (!rowId) return;
    let cancelled = false;
    const requested = `${entity}:${rowId}`;
    getImportDataAction(entity, rowId)
      .then((data) => {
        if (!cancelled) setLoaded({ key: requested, data });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: requested, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [entity, rowId]);

  return key && loaded?.key === key ? loaded.data : null;
}
