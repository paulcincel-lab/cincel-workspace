"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Progress } from "@/components/ui/shadcn/progress";
import { JOB_STATUS_LABELS, jobPercent } from "@/lib/monday-import/wizard-steps";
import type { MondayImportJob } from "@/lib/types/monday-import";

/** Progress bar, status and the last lines of a background job's log (never holds the token). */
export function JobProgress({ job, title }: { job: MondayImportJob; title: string }) {
  const percent = jobPercent(job);
  const { done, total, label } = job.progress;
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
      {job.log.length > 0 ? (
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">Registro</summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 font-mono text-xs text-foreground">
            {job.log.slice(-200).join("\n")}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
