"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Upload, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { SelectionBar } from "@/components/configuracion/monday-import/BoardGallery";
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
import { buildBoardCards, needsExport, selectionTotals } from "@/lib/monday-import/board-cards";
import {
  MONDAY_IMPORT_STEPS,
  canAdvance,
  canJumpTo,
  clampOptions,
  initialStep,
  isJobRunning,
  nextStep,
  previousStep,
  setPerson,
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
import type { CreatedStaff } from "@/scripts/monday/created-staff";

const POLL_MS = 2000;
const UNEXPECTED = "Algo salió mal. Intenta de nuevo.";
/** Steps that edit the draft: leaving one saves it. */
const DRAFT_STEPS: MondayImportStep[] = ["tableros", "equivalencias", "personas", "opciones"];
/** Where the ✕ goes; the run stays on the server and opening the page again resumes it. */
const CLOSE_HREF = "/configuracion";

/** Boards whose card was opened, per run, in this browser only (a convenience: «mapear» until opened). */
function reviewedKey(runId: string): string {
  return `monday-import:reviewed:${runId}`;
}

function readReviewed(runId: string | null): string[] {
  if (!runId) return [];
  try {
    const raw = window.localStorage.getItem(reviewedKey(runId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeReviewed(runId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(reviewedKey(runId), JSON.stringify(ids));
  } catch {
    // Without storage the chips just start at «mapear» again next time.
  }
}

export type MondayImportWizardProps = {
  initialRun: MondayImportRunState | null;
  initialChoices: MondayImportChoices | null;
  hasServerToken: boolean;
  /** Load error of the page (no run could be opened). */
  loadError: string | null;
};

/** The step chips; a finished step opens on click when going back is allowed (#679). */
function StepHeader({
  current,
  canJump,
  onJump,
}: {
  current: MondayImportStep;
  canJump: (step: MondayImportStep) => boolean;
  onJump: (step: MondayImportStep) => void;
}) {
  const currentIndex = stepIndex(current);
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Pasos">
      {MONDAY_IMPORT_STEPS.map((step, index) => {
        const content = (
          <>
            {index < currentIndex ? <Check data-icon="inline-start" aria-hidden="true" /> : null}
            {index + 1}. {step.label}
          </>
        );
        return (
          <li key={step.id} aria-current={index === currentIndex ? "step" : undefined}>
            {canJump(step.id) ? (
              <Badge
                variant="secondary"
                render={<button type="button" aria-label={`Volver a ${step.label}`} onClick={() => onJump(step.id)} />}
              >
                {content}
              </Badge>
            ) : (
              <Badge variant={index === currentIndex ? "default" : index < currentIndex ? "secondary" : "outline"}>
                {content}
              </Badge>
            )}
          </li>
        );
      })}
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
  /** Board Equivalencias opens on ("Corregir" in Vista previa). */
  const [focusBoardId, setFocusBoardId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
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

  useEffect(() => {
    // Browser storage is only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewed(readReviewed(runId));
  }, [runId]);

  function markReviewed(boardId: string) {
    if (!runId) return;
    setReviewed((current) => {
      if (current.includes(boardId)) return current;
      const next = [...current, boardId];
      writeReviewed(runId, next);
      return next;
    });
  }

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

  /** "Crear integrante" on a Vista previa warning (#689): maps the person as Personas does, saves and recalculates. */
  function staffCreatedInPreview(mondayUserId: string, member: CreatedStaff) {
    if (!runId || !mapping) return;
    const next = setPerson(mapping, mondayUserId, { action: "staff", staffId: member.id, created: true });
    setChoices((current) => (current ? { ...current, staff: [...current.staff, member] } : current));
    editMapping(next);
    setPreviewError("");
    startTransition(async () => {
      try {
        const saved = await saveMondayMappingDraftAction(runId, next);
        if (!saved.ok) {
          setPreviewError(saved.error);
          return;
        }
        const result = await previewMondayImportAction(runId);
        if (result.ok) setPreview(result.preview);
        else setPreviewError(result.error);
      } catch {
        setPreviewError(UNEXPECTED);
      }
    });
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

  function goTo(target: MondayImportStep, boardId: string | null = null, personId: string | null = null) {
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
        setFocusBoardId(boardId);
        setFocusPersonId(personId);
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

  /** ✕: saves the draft (if this step edits it) and leaves; the run is resumed when the page opens again. */
  function close() {
    setError("");
    startTransition(async () => {
      try {
        if (DRAFT_STEPS.includes(step) && mapping && runId && !run?.batchId) {
          const saved = await saveDraft(step);
          if (saved === null) return;
        }
        router.push(CLOSE_HREF);
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
  const cards = useMemo(
    () => buildBoardCards({ connection, mapping, source, preview, reviewed: new Set(reviewed) }),
    [connection, mapping, source, preview, reviewed],
  );
  const totals = selectionTotals(cards, selectedBoardIds);
  const exportRunning = isJobRunning(run?.jobs.export);
  const mustExport = needsExport(Boolean(run?.exported), run?.boardIds ?? [], selectedBoardIds);
  const importBoards = (mapping?.boards ?? [])
    .filter((board) => board.strategy !== "skip")
    .map((board) => ({ id: board.mondayBoardId, name: board.name }));

  /** "Importar n tableros": exports the picked boards when they aren't the exported ones, else goes on to map them. */
  function importSelected() {
    if (mustExport) startExport();
    else goTo(nextStep("tableros"));
  }

  const topBar = (
    <header className="sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-3 md:px-6">
        <div className="min-w-0 space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Importar de monday</h1>
          {run ? (
            <StepHeader
              current={step}
              canJump={(target) => !isPending && canJumpTo(target, step, state)}
              onJump={(target) => goTo(target)}
            />
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cerrar"
          title="Cerrar (la importación se guarda)"
          disabled={isPending}
          onClick={close}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </header>
  );

  if (!run) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {topBar}
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <Alert variant="destructive">
            <AlertDescription>{error || "No se pudo abrir la importación. Recarga la página."}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {topBar}

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6 md:px-6">
        <div className="space-y-1">
          <h2 className="text-base font-medium text-foreground">{current.label}</h2>
          <p className="text-sm text-muted-foreground">{current.description}</p>
        </div>
        {mapping && !finished ? (
          <div className="flex flex-wrap gap-2">
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

        {/* Keyed by step so each step fades in; motion-safe keeps it still with prefers-reduced-motion. */}
        <div key={step} className="space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          {step === "conectar" ? (
            <ConnectStep
              token={token}
              onTokenChange={setToken}
              hasServerToken={hasServerToken}
              connection={connection}
              onConnected={setConnection}
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
              cards={cards}
              source={source}
              choices={choices}
              onBoardOpened={markReviewed}
              onStatusCreated={(status) =>
                setChoices((previous) => (previous ? { ...previous, statuses: [...previous.statuses, status] } : previous))
              }
              onStatusMapSaved={(statusMap) =>
                setChoices((previous) => (previous ? { ...previous, statusMap } : previous))
              }
              onStaffCreated={(member) =>
                setChoices((previous) => (previous ? { ...previous, staff: [...previous.staff, member] } : previous))
              }
            />
          ) : null}
          {needsData && !ready ? <p className="text-sm text-muted-foreground">Cargando equivalencias…</p> : null}
          {step === "equivalencias" && mapping && source && choices ? (
            <EquivalenciasStep
              mapping={mapping}
              source={source}
              choices={choices}
              initialBoardId={focusBoardId}
              onMappingChange={editMapping}
              onStatusCreated={(status) =>
                setChoices((previous) => (previous ? { ...previous, statuses: [...previous.statuses, status] } : previous))
              }
              onStatusMapSaved={(statusMap) =>
                setChoices((previous) => (previous ? { ...previous, statusMap } : previous))
              }
            />
          ) : null}
          {step === "personas" && mapping && source && choices ? (
            <PeopleStep
              mapping={mapping}
              source={source}
              choices={choices}
              runId={runId}
              onMappingChange={editMapping}
              onStaffCreated={(member) =>
                setChoices((current) => (current ? { ...current, staff: [...current.staff, member] } : current))
              }
              focusPersonId={focusPersonId}
            />
          ) : null}
          {step === "opciones" && mapping ? (
            <OptionsStep mapping={mapping} info={optionsInfo} error={optionsError} onMappingChange={editMapping} />
          ) : null}
          {step === "vista_previa" ? (
            <PreviewStep
              preview={preview}
              error={previewError}
              isPending={isPending}
              onRefresh={refreshPreview}
              onFix={(target, boardId, personId) => goTo(target, boardId, personId ?? null)}
              runId={runId}
              positions={choices?.positions ?? []}
              onStaffCreated={staffCreatedInPreview}
            />
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
              onStartNew={startOver}
              boards={importBoards}
            />
          ) : null}
        </div>

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
      </div>

      <footer className="sticky bottom-0 z-20 border-t bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {finished ? null : (
              <Button variant="ghost" disabled={isPending} onClick={complete}>
                Omitir por ahora
              </Button>
            )}
          </div>
          {step === "tableros" && connection && !run.batchId ? (
            <SelectionBar
              totals={totals}
              exporting={exportRunning}
              disabled={isPending || anyJobRunning || (!mustExport && !canAdvance(step, state))}
              onImport={importSelected}
            />
          ) : null}
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
        </div>
      </footer>
    </div>
  );
}
