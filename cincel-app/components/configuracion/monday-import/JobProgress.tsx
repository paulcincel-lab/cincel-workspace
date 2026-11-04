"use client";

import { Download } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Progress } from "@/components/ui/shadcn/progress";
import { JOB_STATUS_LABELS, jobPercent } from "@/lib/monday-import/wizard-steps";
import type { MondayImportJob } from "@/lib/types/monday-import";

/** Saves the job's English command output as a text file (it may hold server paths, so it is never shown). */
function downloadLog(job: MondayImportJob) {
  const url = URL.createObjectURL(new Blob([job.log.join("\n") + "\n"], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `monday-${job.kind}-registro.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Progress bar, status and the Registro: the job's Spanish notes on screen, its English command output only as a
 * download (#679). Neither holds the token.
 */
export function JobProgress({ job, title }: { job: MondayImportJob; title: string }) {
  const percent = jobPercent(job);
  const { done, total, label } = job.progress;
  const notes = job.notes ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Badge variant={job.status === "succeeded" ? "secondary" : "outline"}>{JOB_STATUS_LABELS[job.status]}</Badge>
      </div>
      <Progress value={percent} aria-label={title} />
      <p className="text-sm text-muted-foreground">
        {label}
        {total ? ` (${done} de ${total})` : null}
      </p>
      {job.error ? (
        <Alert variant="destructive">
          <AlertTitle>No se terminó</AlertTitle>
          <AlertDescription>{job.error}</AlertDescription>
        </Alert>
      ) : null}
      {job.status === "interrupted" ? (
        <Alert>
          <AlertDescription>El servidor se reinició mientras corría. Vuelve a iniciarlo para continuar.</AlertDescription>
        </Alert>
      ) : null}
      {notes.length > 0 || job.log.length > 0 ? (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">Registro</summary>
          <div className="space-y-3 px-3 pb-3">
            {notes.length > 0 ? (
              <ul className="max-h-64 space-y-1 overflow-auto text-sm text-foreground">
                {notes.slice(-200).map((line, index) => (
                  <li key={index} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
            {job.log.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => downloadLog(job)}>
                <Download data-icon="inline-start" aria-hidden="true" />
                Descargar registro técnico (inglés)
              </Button>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
