"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { BoardsStep, type ExportChoice } from "@/components/configuracion/monday-import/BoardsStep";
import { ConnectStep } from "@/components/configuracion/monday-import/ConnectStep";
import { EquivalenciasStep } from "@/components/configuracion/monday-import/EquivalenciasStep";
import { ImportStep } from "@/components/configuracion/monday-import/ImportStep";
import { OptionsStep } from "@/components/configuracion/monday-import/OptionsStep";
import { PeopleStep } from "@/components/configuracion/monday-import/PeopleStep";
import { PreviewStep } from "@/components/configuracion/monday-import/PreviewStep";
import {
  checkMondayRollbackAction,
  downloadMondayMappingAction,
  getMondayExportSourceAction,
  getMondayImportedProjectsAction,
  getMondayImportOptionsAction,
  getMondayImportRunAction,
  openMondayImportRunAction,
  previewMondayImportAction,
  saveMondayImportStepAction,
  saveMondayMappingDraftAction,
  startMondayApplyAction,
  startMondayExportAction,
  startMondayRollbackAction,
  uploadMondayMappingAction,
} from "@/lib/actions/monday-import-actions";
import { completeOnboardingAction } from "@/lib/actions/onboarding-actions";
import {
  MONDAY_IMPORT_STEPS,
  canAdvance,
  clampOptions,
  initialStep,
  isJobRunning,
  nextStep,
  previousStep,
  stepIndex,
  validateMapping,
} from "@/lib/monday-import/wizard-steps";
import type {
  MappingInput,
  MondayConnection,
  MondayExportSource,
  MondayImportChoices,
  MondayImportedProject,
  MondayImportOptionsInfo,
  MondayImportRunState,
  MondayImportStep,
  MondayPreview,
  MondayRollbackCheck,
} from "@/lib/types/monday-import";

const POLL_MS = 2000;
const UNEXPECTED = "Algo salió mal. Intenta de nuevo.";
/** Steps that edit the draft: leaving one saves it. */
const DRAFT_STEPS: MondayImportStep[] = ["tableros", "equivalencias", "personas", "opciones"];

export type MondayImportWizardProps = {
  initialRun: MondayImportRunState | null;
  initialChoices: MondayImportChoices | null;
  hasServerToken: boolean;
  /** Load error of the page (no run could be opened). */
  loadError: string | null;
};

function StepHeader({ current }: { current: MondayImportStep }) {
  const currentIndex = stepIndex(current);
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Pasos">
      {MONDAY_IMPORT_STEPS.map((step, index) => (
        <li key={step.id} aria-current={index === currentIndex ? "step" : undefined}>
          <Badge variant={index === currentIndex ? "default" : index < currentIndex ? "secondary" : "outline"}>
            {index < currentIndex ? <Check data-icon="inline-start" aria-hidden="true" /> : null}
            {index + 1}. {step.label}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <Alert variant="destructive" id="monday-mapping-issues">
      <AlertTitle>Faltan equivalencias</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          {issues.slice(0, 15).map((issue) => (
            <li key={issue} className="break-words">
              {issue}
            </li>
          ))}
        </ul>
        {issues.length > 15 ? <p className="pt-1">Y {issues.length - 15} más.</p> : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Importar de monday (#672): the CLI's export → init → plan → apply → rollback as a resumable wizard. The draft
 * mapping.json lives on the server; the monday token only in this component's state.
 */
export function MondayImportWizard({ initialRun, initialChoices, hasServerToken, loadError }: MondayImportWizardProps) {
  const router = useRouter();
  const [run, setRun] = useState<MondayImportRunState | null>(initialRun);
  const [step, setStep] = useState<MondayImportStep>(() => initialStep(initialRun));
  const [token, setToken] = useState("");
  const [connection, setConnection] = useState<MondayConnection | null>(null);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>(initialRun?.boardIds ?? []);
  const [exportChoice, setExportChoice] = useState<ExportChoice>(
    initialRun?.exportOptions ?? { updates: true, files: true },
  );
  const [mapping, setMapping] = useState<MappingInput | null>(initialRun?.mapping ?? null);
  const [source, setSource] = useState<MondayExportSource | null>(null);
  const [choices, setChoices] = useState<MondayImportChoices | null>(initialChoices);
  const [optionsInfo, setOptionsInfo] = useState<MondayImportOptionsInfo | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [preview, setPreview] = useState<MondayPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  // null until the applied run's projects load, so Importar shows a loading state instead of "no projects".
  const [projects, setProjects] = useState<MondayImportedProject[] | null>(null);
  const [rollbackCheck, setRollbackCheck] = useState<MondayRollbackCheck | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState(loadError ?? "");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const runId = run?.runId ?? null;
  const anyJobRunning = Boolean(run && Object.values(run.jobs).some((job) => isJobRunning(job)));

  // --- Loading -------------------------------------------------------------------------------------------------

  const loadSource = useCallback(async (id: string) => {
    const result = await getMondayExportSourceAction(id);
    if (result.ok) setSource(result.source);
    else setError(result.error);
  }, []);

  const loadResult = useCallback(async (id: string) => {
    const [projectsResult, checkResult] = await Promise.all([
      getMondayImportedProjectsAction(id),
      checkMondayRollbackAction(id),
    ]);
    setProjects(projectsResult.ok ? projectsResult.projects : []);
    setRollbackCheck(checkResult.ok ? checkResult.check : null);
  }, []);

  const runRef = useRef(run);
  const mappingRef = useRef(mapping);
  useEffect(() => {
    runRef.current = run;
    mappingRef.current = mapping;
  }, [run, mapping]);

  /** Applies a polled run state; picks up the draft init wrote when the export finished. */
  const applyRun = useCallback(
    (next: MondayImportRunState) => {
      const previous = runRef.current;
      setRun(next);
      const exportFinished = isJobRunning(previous?.jobs.export) && next.jobs.export?.status === "succeeded";
      if (exportFinished || (!mappingRef.current && next.mapping)) {
        setMapping(next.mapping);
        setSelectedBoardIds(next.boardIds);
        if (next.exported) void loadSource(next.runId);
      }
      const jobFinished =
        (isJobRunning(previous?.jobs.apply) && !isJobRunning(next.jobs.apply)) ||
        (isJobRunning(previous?.jobs.rollback) && !isJobRunning(next.jobs.rollback));
      if (jobFinished && next.batchId) void loadResult(next.runId);
    },
    [loadResult, loadSource],
  );

  useEffect(() => {
    // Only on the first render with a run: later loads come from applyRun.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (runId && run?.exported && !source) void loadSource(runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (runId && run?.batchStatus === "applied") void loadResult(runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Poll every ~2 s while a background job runs.
  useEffect(() => {
    if (!runId || !anyJobRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await getMondayImportRunAction(runId);
        if (result.ok) applyRun(result.run);
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [runId, anyJobRunning, applyRun]);

  useEffect(() => {
    if (step !== "opciones" || !runId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptionsError("");
    getMondayImportOptionsAction(runId)
      .then((result) => {
        if (!result.ok) return setOptionsError(result.error);
        setOptionsInfo(result.options);
        // A draft that still asks for what can't be imported (files without Drive) is turned off here, so it is
        // saved that way on Siguiente instead of blocking Vista previa.
        setMapping((current) => (current ? clampOptions(current, result.options) : current));
      })
      .catch(() => setOptionsError(UNEXPECTED));
  }, [step, runId]);

  function refreshPreview() {
    if (!runId) return;
    setPreviewError("");
    startTransition(async () => {
      try {
        const result = await previewMondayImportAction(runId);
        if (result.ok) setPreview(result.preview);
        else setPreviewError(result.error);
      } catch {
        setPreviewError(UNEXPECTED);
      }
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step === "vista_previa") refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // --- Actions -------------------------------------------------------------------------------------------------

  function editMapping(next: MappingInput) {
    setMapping(next);
    setPreview(null);
    if (issues.length > 0) setIssues(validateMapping(next));
  }

  async function saveDraft(target: MondayImportStep): Promise<string[] | null> {
    if (!runId || !mapping) return [];
    const result = await saveMondayMappingDraftAction(runId, mapping, target);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    return result.issues;
  }

  function goTo(target: MondayImportStep) {
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        if (DRAFT_STEPS.includes(step) && mapping) {
          const found = await saveDraft(target);
          if (found === null) return;
          const forward = stepIndex(target) > stepIndex(step);
          const validates = step !== "tableros";
          if (forward && validates && found.length > 0) {
            setIssues(found);
            return;
          }
          setIssues(forward && validates ? found : []);
        } else if (runId) {
          const result = await saveMondayImportStepAction(runId, target);
          if (!result.ok) {
            setError(result.error);
            return;
          }
        }
        setStep(target);
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  function startExport() {
    if (!runId) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await startMondayExportAction(runId, token.trim() || null, {
          boardIds: selectedBoardIds,
          updates: exportChoice.updates,
          files: exportChoice.files,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setRun((previous) => (previous ? { ...previous, jobs: { ...previous.jobs, export: result.job } } : previous));
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  function startApply() {
    if (!runId) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await startMondayApplyAction(runId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setRun((previous) => (previous ? { ...previous, jobs: { ...previous.jobs, apply: result.job } } : previous));
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  function startRollback() {
    if (!runId) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await startMondayRollbackAction(runId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setRun((previous) => (previous ? { ...previous, jobs: { ...previous.jobs, rollback: result.job } } : previous));
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  function startOver() {
    setError("");
    startTransition(async () => {
      try {
        const result = await openMondayImportRunAction(true);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setRun(result.run);
        setMapping(null);
        setSource(null);
        setPreview(null);
        setProjects([]);
        setRollbackCheck(null);
        setIssues([]);
        setSelectedBoardIds([]);
        setStep(connection ? "tableros" : "conectar");
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  function complete() {
    setError("");
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction();
        if (!result.ok) {
          setError("No tienes permiso.");
          return;
        }
        router.replace("/dashboard");
      } catch {
        setError("No se pudo guardar. Intenta de nuevo.");
      }
    });
  }

  function download() {
    if (!runId) return;
    setError("");
    startTransition(async () => {
      try {
        if (mapping) {
          const saved = await saveDraft(step);
          if (saved === null) return;
        }
        const result = await downloadMondayMappingAction(runId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const url = URL.createObjectURL(new Blob([result.content], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = result.fileName;
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  function upload(file: File) {
    if (!runId) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await uploadMondayMappingAction(runId, await file.text());
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.issues.length > 0) {
          setIssues(result.issues);
          return;
        }
        const fresh = await getMondayImportRunAction(runId);
        if (fresh.ok) {
          setRun(fresh.run);
          setMapping(fresh.run.mapping);
        }
        setIssues([]);
        setPreview(null);
        setNotice("Se cargó mapping.json.");
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  // --- Render --------------------------------------------------------------------------------------------------

  const current = MONDAY_IMPORT_STEPS[stepIndex(step)];
  const state = { connection, run, selectedBoardIds, mapping, preview };
  const needsData = step === "equivalencias" || step === "personas";
  const ready = Boolean(mapping && source && choices);
  const finished = run?.batchStatus === "applied" || run?.batchStatus === "rolled_back";

  if (!run) {
    return (
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Importar de monday</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error || "No se pudo abrir la importación. Recarga la página."}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-5xl">
      <CardHeader>
        <StepHeader current={step} />
        <CardTitle className="pt-2">{current.label}</CardTitle>
        <CardDescription>{current.description}</CardDescription>
        {mapping && !finished ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" disabled={isPending} onClick={download}>
              <Download data-icon="inline-start" aria-hidden="true" />
              Descargar mapping.json
            </Button>
            <Button variant="outline" size="sm" disabled={isPending || anyJobRunning} onClick={() => fileInput.current?.click()}>
              <Upload data-icon="inline-start" aria-hidden="true" />
              Cargar mapping.json
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Archivo mapping.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) upload(file);
              }}
            />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {step === "conectar" ? (
          <ConnectStep
            token={token}
            onTokenChange={setToken}
            hasServerToken={hasServerToken}
            connection={connection}
            onConnected={(next) => {
              setConnection(next);
              if (selectedBoardIds.length === 0) setSelectedBoardIds(next.boards.map((board) => board.id));
            }}
          />
        ) : null}
        {step === "tableros" ? (
          <BoardsStep
            connection={connection}
            run={run}
            selectedBoardIds={selectedBoardIds}
            onSelectedChange={setSelectedBoardIds}
            exportChoice={exportChoice}
            onExportChoiceChange={setExportChoice}
            onStartExport={startExport}
            isPending={isPending}
            mapping={mapping}
            onMappingChange={editMapping}
          />
        ) : null}
        {needsData && !ready ? <p className="text-sm text-muted-foreground">Cargando equivalencias…</p> : null}
        {step === "equivalencias" && mapping && source && choices ? (
          <EquivalenciasStep
            mapping={mapping}
            source={source}
            choices={choices}
            onMappingChange={editMapping}
            onStatusCreated={(status) =>
              setChoices((previous) => (previous ? { ...previous, statuses: [...previous.statuses, status] } : previous))
            }
          />
        ) : null}
        {step === "personas" && mapping && source && choices ? (
          <PeopleStep mapping={mapping} source={source} choices={choices} onMappingChange={editMapping} />
        ) : null}
        {step === "opciones" && mapping ? (
          <OptionsStep mapping={mapping} info={optionsInfo} error={optionsError} onMappingChange={editMapping} />
        ) : null}
        {step === "vista_previa" ? (
          <PreviewStep preview={preview} error={previewError} isPending={isPending} onRefresh={refreshPreview} />
        ) : null}
        {step === "importar" ? (
          <ImportStep
            run={run}
            projects={projects}
            rollbackCheck={rollbackCheck}
            isPending={isPending}
            error={error}
            onStartApply={startApply}
            onStartRollback={startRollback}
            onFinish={complete}
          />
        ) : null}

        <IssueList issues={issues} />
        {notice ? (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {error && step !== "importar" ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {finished ? null : (
            <Button variant="ghost" disabled={isPending} onClick={complete}>
              Omitir por ahora
            </Button>
          )}
          {run.batchStatus === "rolled_back" ? (
            <Button variant="outline" disabled={isPending || anyJobRunning} onClick={startOver}>
              Empezar una importación nueva
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {step !== "conectar" && step !== "importar" ? (
            <Button variant="outline" disabled={isPending || anyJobRunning} onClick={() => goTo(previousStep(step))}>
              Atrás
            </Button>
          ) : null}
          {step === "importar" && !run.batchId && !anyJobRunning ? (
            <Button variant="outline" disabled={isPending} onClick={() => goTo("vista_previa")}>
              Atrás
            </Button>
          ) : null}
          {step !== "importar" ? (
            <Button
              disabled={isPending || anyJobRunning || !canAdvance(step, state)}
              aria-describedby={issues.length > 0 ? "monday-mapping-issues" : undefined}
              onClick={() => goTo(nextStep(step))}
            >
              {step === "vista_previa" ? "Continuar a importar" : "Siguiente"}
            </Button>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
