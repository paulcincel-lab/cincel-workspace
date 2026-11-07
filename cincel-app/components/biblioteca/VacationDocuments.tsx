"use client";

import { FileText } from "lucide-react";

import { RecordTable } from "@/components/widgets/RecordTable";
import { WidgetCard } from "@/components/widgets/WidgetCard";

/** One `resource_links` row of section `mis-vacaciones`, as the page passes it. */
export type VacationDocument = { id: string; title: string; url: string; updatedAt: string };

export type VacationDocumentsProps = { documents: VacationDocument[] };

/**
 * "Documentos" of Mis vacaciones (redesign FE §3.7, review NB 25): the
 * existing `resource_links` rows of the old `mis-vacaciones` section, so
 * nothing is lost behind the redirect. Links open in a new tab.
 */
export function VacationDocuments({ documents }: VacationDocumentsProps) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  return (
    <WidgetCard title="Documentos" icon={FileText}>
      <RecordTable
        data={{
          columns: [
            { key: "documento", label: "Documento" },
            { key: "actualizado", label: "Actualizado", format: "date", align: "right" },
          ],
          rows: documents.map((doc) => ({ id: doc.id, documento: doc.title, actualizado: doc.updatedAt })),
        }}
        emptyState={{ title: "Aún no hay documentos de vacaciones" }}
        renderCell={(columnKey, row) => {
          if (columnKey !== "documento") return undefined;
          const doc = typeof row.id === "string" ? byId.get(row.id) : undefined;
          if (!doc) return undefined;
          return (
            <a href={doc.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              {doc.title}
            </a>
          );
        }}
      />
    </WidgetCard>
  );
}
