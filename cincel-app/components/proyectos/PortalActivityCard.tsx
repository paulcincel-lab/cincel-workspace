"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { listProjectPortalActivityAction } from "@/lib/actions/portal-actions";
import type { PortalActivityRow } from "@/lib/types/portal";

export const PORTAL_ACTIVITY_ACTION_LABEL: Record<PortalActivityRow["action"], string> = {
  download: "Descarga",
  preview: "Vista previa",
  upload: "Subida",
};

const LOAD_ERROR = "No se pudo cargar la actividad.";
const EMPTY = "Todavía no hay actividad de clientes en este proyecto.";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** Clientes tab Actividad card (FE §2.4): the last 50 portal file events, newest first. */
export function PortalActivityCard({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<PortalActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listProjectPortalActivityAction(projectId)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) setError(LOAD_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad</CardTitle>
        <CardDescription>Descargas, vistas previas y archivos subidos por los clientes.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando actividad…</p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{EMPTY}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Archivo</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell className="max-w-64 truncate">{row.fileName}</TableCell>
                  <TableCell>
                    <Badge variant={row.action === "upload" ? "default" : "secondary"}>
                      {PORTAL_ACTIVITY_ACTION_LABEL[row.action]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <time dateTime={row.at}>{dateFormatter.format(new Date(row.at))}</time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
