"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Download, Upload, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { SelectionBar } from "@/components/configuracion/monday-import/BoardGallery";
import { BoardsStep, type ExportChoice } from "@/components/configuracion/monday-import/BoardsStep";
import { ConnectStep } from "@/components/configuracion/monday-import/ConnectStep";
import { EquivalenciasStep } from "@/components/configuracion/monday-import/EquivalenciasStep";
import { ImportStep } from "@/components/configuracion/monday-import/ImportStep";
import { mondayErrorText, useMondayMutation } from "@/components/configuracion/monday-import/monday-mutations";
import { OptionsStep } from "@/components/configuracion/monday-import/OptionsStep";
import { PeopleStep } from "@/components/configuracion/monday-import/PeopleStep";
import { PreviewStep } from "@/components/configuracion/monday-import/PreviewStep";
import { WizardStepper } from "@/components/configuracion/WizardStepper";
import {
  downloadMondayMappingAction,
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
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import {
  isMondayRunBusy,
  mondayChoicesOptions,
  mondayImportedProjectsOptions,
  mondayImportOptionsOptions,
  mondayRollbackCheckOptions,
  mondayRunOptions,
  mondaySourceOptions,
} from "@/lib/query/options/monday";
import { readJsonStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import type {
  MappingInput,
  MondayConnection,
  MondayImportChoices,
  MondayImportJob,
  MondayImportJobKind,
  MondayImportOptionsInfo,
  MondayImportRunState,
  MondayImportStep,
} from "@/lib/types/monday-import";
import type { CreatedStaff } from "@/scripts/monday/created-staff";

/** Steps that edit the draft: leaving one saves it. */
const DRAFT_STEPS: MondayImportStep[] = ["tableros", "equivalencias", "personas", "opciones"];
/** Where the ✕ goes; the run stays on the server and "Continuar importación" resumes it. */
const CLOSE_HREF = "/configuracion";

/** Boards whose card was opened, per run, in this browser only (a convenience: «mapear» until opened). */
function reviewedKey(runId: string): string {
  return `monday-import:reviewed:${runId}`;
}

function readReviewed(runId: string): string[] {
  try {
    const parsed = readJsonStorage<unknown>(reviewedKey(runId), []);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeReviewed(runId: string, ids: string[]): void {
  try {
    writeStorage(reviewedKey(runId), JSON.stringify(ids));
  } catch {
    // Without storage the chips just start at «mapear» again next time.
  }
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

/** "Vista previa" (Paso 6): computed on demand, never cached (no invalidation). */
function usePreviewMutation() {
  return useMondayMutation((runId: string) => previewMondayImportAction(runId));
}

type PreviewMutation = ReturnType<typeof usePreviewMutation>;

/** The run the button opened and the step the wizard starts at. */
type OpenedRun = { run: MondayImportRunState; step: MondayImportStep };

/** Writes a job a start action returned into the run's cache entry, so the poll starts. */
function withJob(kind: MondayImportJobKind, job: MondayImportJob) {
  return (current: MondayImportRunState | undefined) =>
    current ? { ...current, jobs: { ...current.jobs, [kind]: job } } : current;
}

export type MondayImportWizardProps = {
  /** The latest run, read only from the page data; null when there is none. */
  latestRun: MondayImportRunState | null;
  hasServerToken: boolean;
  /** Load error of the page data (the run state or the choices could not be read). */
  loadError: string | null;
};

/**
 * Importar de monday (#672): the CLI's export → init → plan → apply → rollback as a resumable wizard. The page only
 * reads the latest run; "Iniciar importación" / "Continuar importación" creates or resumes it (#966). The draft
 * mapping.json lives on the server; the monday token only in this component's state.
 */
export function MondayImportWizard({ latestRun, hasServerToken, loadError }: MondayImportWizardProps) {
  const [opened, setOpened] = useState<OpenedRun | null>(null);
  const [token, setToken] = useState("");
  const [connection, setConnection] = useState<MondayConnection | null>(null);
  const [openError, setOpenError] = useState("");
  const preview = usePreviewMutation();
  const openRun = useMondayMutation((fresh: boolean) => openMondayImportRunAction(fresh), {
    setData: (qc, result) => qc.setQueryData(qk.monday.run(result.run.runId), result.run),
    invalidate: [qk.ajustes.page("monday")],
  });

  /** Opens a run (`fresh` = a new one) and shows the wizard at `stepFor(run)`. Throws on failure. */
  async function open(fresh: boolean, stepFor: (run: MondayImportRunState) => MondayImportStep) {
    const { run } = await openRun.mutateAsync(fresh);
    preview.reset();
    const step = stepFor(run);
    setOpened({ run, step });
    if (step === "vista_previa") preview.mutate(run.runId);
  }

  async function startOrContinue() {
    setOpenError("");
    try {
      // With a saved run the button resumes it; with none it starts a new one.
      await open(latestRun === null, initialStep);
    } catch (err) {
      setOpenError(mondayErrorText(err, "No se pudo abrir la importación. Intenta de nuevo."));
    }
  }

  if (!opened) {
    const resumeStep = latestRun ? MONDAY_IMPORT_STEPS[stepIndex(initialStep(latestRun))] : null;
    return (
      <div className="space-y-4">
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}
        {resumeStep ? (
          <p className="text-sm text-muted-foreground">
            Tienes una importación guardada. Paso actual: <span className="font-medium text-foreground">{resumeStep.label}</span>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Conecta tu cuenta de monday y elige qué tableros traer a Cincel.</p>
        )}
        <Button disabled={openRun.isPending} onClick={() => void startOrContinue()}>
          {latestRun ? "Continuar importación" : "Iniciar importación"}
        </Button>
        {openError ? (
          <Alert variant="destructive">
            <AlertDescription>{openError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <MondayRunWizard
      key={opened.run.runId}
      opened={opened}
      hasServerToken={hasServerToken}
      token={token}
      onTokenChange={setToken}
      connection={connection}
      onConnected={setConnection}
      preview={preview}
      startingOver={openRun.isPending}
      onStartOver={() => open(true, () => (connection ? "tableros" : "conectar"))}
    />
  );
}

/**
 * One opened run. The run state is `monday.run(id)` (polled every 2 s while a job runs); the draft being edited,
 * the step and the other wizard choices are this component's state, seeded once from the opened run.
 */
function MondayRunWizard({
  opened,
  hasServerToken,
  token,
  onTokenChange,
  connection,
  onConnected,
  preview,
  startingOver,
  onStartOver,
}: {
  opened: OpenedRun;
  hasServerToken: boolean;
  token: string;
  onTokenChange: (token: string) => void;
  connection: MondayConnection | null;
  onConnected: (connection: MondayConnection) => void;
  preview: PreviewMutation;
  startingOver: boolean;
  onStartOver: () => Promise<void>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const runId = opened.run.runId;
  const runKey = qk.monday.run(runId);

  // The open button already wrote the run into the cache: no refetch on mount, only the poll.
  const runQuery = useQuery({ ...mondayRunOptions(runId), refetchOnMount: false });
  const run = runQuery.data ?? opened.run;
  const choices = useQuery(mondayChoicesOptions()).data ?? null;

  const [step, setStep] = useState<MondayImportStep>(opened.step);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>(opened.run.boardIds);
  const [exportChoice, setExportChoice] = useState<ExportChoice>(
    opened.run.exportOptions ?? { updates: true, files: true },
  );
  const [mapping, setMapping] = useState<MappingInput | null>(opened.run.mapping);
  const [previewSaveError, setPreviewSaveError] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** Board Equivalencias opens on ("Corregir" in Vista previa). */
  const [focusBoardId, setFocusBoardId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  // Mounted only after the button is clicked, so browser storage is readable here.
  const [reviewed, setReviewed] = useState<string[]>(() => readReviewed(runId));
  const fileInput = useRef<HTMLInputElement>(null);
  const anyJobRunning = isMondayRunBusy(run);

  // The poll brought a new run state: when the export finished (or a draft appeared), take init's draft.
  const [seenRun, setSeenRun] = useState(run);
  if (seenRun !== run) {
    setSeenRun(run);
    const exportFinished = isJobRunning(seenRun.jobs.export) && run.jobs.export?.status === "succeeded";
    if (exportFinished || (!mapping && run.mapping)) {
      setMapping(run.mapping);
      setSelectedBoardIds(run.boardIds);
    }
  }

  // --- Reads ---------------------------------------------------------------------------------------------------

  const sourceQuery = useQuery({ ...mondaySourceOptions(runId), enabled: run.exported });
  const source = sourceQuery.data ?? null;

  const resultReady = Boolean(run.batchId) && !isJobRunning(run.jobs.apply) && !isJobRunning(run.jobs.rollback);
  const projectsQuery = useQuery({ ...mondayImportedProjectsOptions(runId), enabled: resultReady });
  // null while the applied run's projects load, so Importar shows a loading state instead of "no projects".
  const projects = projectsQuery.data ?? (resultReady && !projectsQuery.isError ? null : []);
  const rollbackCheck = useQuery({ ...mondayRollbackCheckOptions(runId), enabled: resultReady }).data ?? null;

  const optionsQuery = useQuery({ ...mondayImportOptionsOptions(runId), enabled: step === "opciones" });
  const optionsInfo = optionsQuery.data ?? null;
  const optionsError = step === "opciones" && optionsQuery.error ? mondayErrorText(optionsQuery.error) : "";
  // A draft that still asks for what can't be imported (files without Drive) is turned off once the options
  // arrive, so it is saved that way on Siguiente instead of blocking Vista previa.
  const [clampedWith, setClampedWith] = useState<MondayImportOptionsInfo | null>(null);
  if (optionsInfo && optionsInfo !== clampedWith) {
    setClampedWith(optionsInfo);
    if (mapping) setMapping(clampOptions(mapping, optionsInfo));
  }

  // --- Writes --------------------------------------------------------------------------------------------------

  const saveDraftMutation = useMondayMutation(
    (vars: { mapping: MappingInput; step?: MondayImportStep }) =>
      saveMondayMappingDraftAction(runId, vars.mapping, vars.step),
    {
      setData: (client, _result, vars) =>
        client.setQueryData<MondayImportRunState>(runKey, (current) =>
          current ? { ...current, mapping: vars.mapping, step: vars.step ?? current.step } : current,
        ),
    },
  );
  const saveStepMutation = useMondayMutation((target: MondayImportStep) => saveMondayImportStepAction(runId, target), {
    setData: (client, _result, target) =>
      client.setQueryData<MondayImportRunState>(runKey, (current) => (current ? { ...current, step: target } : current)),
  });
  const exportMutation = useMondayMutation(
    (input: { token: string | null; boardIds: string[]; updates: boolean; files: boolean }) =>
      startMondayExportAction(runId, input.token, { boardIds: input.boardIds, updates: input.updates, files: input.files }),
    { setData: (client, result) => client.setQueryData<MondayImportRunState>(runKey, withJob("export", result.job)) },
  );
  const applyMutation = useMondayMutation((id: string) => startMondayApplyAction(id), {
    setData: (client, result) => client.setQueryData<MondayImportRunState>(runKey, withJob("apply", result.job)),
  });
  const rollbackMutation = useMondayMutation((id: string) => startMondayRollbackAction(id), {
    setData: (client, result) => client.setQueryData<MondayImportRunState>(runKey, withJob("rollback", result.job)),
  });
  const downloadMutation = useMondayMutation((id: string) => downloadMondayMappingAction(id));
  // A clean upload replaces the draft: `upload` then reads the run into `monday.run(id)`.
  const uploadMutation = useMondayMutation((text: string) => uploadMondayMappingAction(runId, text));
  const completeMutation = useActionMutation(() => completeOnboardingAction(), {
    invalidate: [qk.inicio()],
    onFormError: () => {},
  });

  const isPending =
    startingOver ||
    preview.isPending ||
    [
      saveDraftMutation,
      saveStepMutation,
      exportMutation,
      applyMutation,
      rollbackMutation,
      downloadMutation,
      uploadMutation,
      completeMutation,
    ].some((mutation) => mutation.isPending);

  /** Adds to the cached choices what a nested step just created, so its select lists it at once. */
  function patchChoices(patch: (current: MondayImportChoices) => MondayImportChoices) {
    qc.setQueryData<MondayImportChoices>(qk.monday.choices(), (current) => (current ? patch(current) : current));
  }

  const addStatus = (status: MondayImportChoices["statuses"][number]) =>
    patchChoices((current) => ({ ...current, statuses: [...current.statuses, status] }));
  const addStaff = (member: MondayImportChoices["staff"][number]) =>
    patchChoices((current) => ({ ...current, staff: [...current.staff, member] }));

  function markReviewed(boardId: string) {
    setReviewed((current) => {
      if (current.includes(boardId)) return current;
      const next = [...current, boardId];
      writeReviewed(runId, next);
      return next;
    });
  }

  function refreshPreview() {
    setPreviewSaveError("");
    preview.mutate(runId);
  }

  function editMapping(next: MappingInput) {
    setMapping(next);
    preview.reset();
    if (issues.length > 0) setIssues(validateMapping(next));
  }

  /** "Crear integrante" on a Vista previa warning (#689): maps the person as Personas does, saves and recalculates. */
  async function staffCreatedInPreview(mondayUserId: string, member: CreatedStaff) {
    if (!mapping) return;
    const next = setPerson(mapping, mondayUserId, { action: "staff", staffId: member.id, created: true });
    addStaff(member);
    editMapping(next);
    setPreviewSaveError("");
    try {
      await saveDraftMutation.mutateAsync({ mapping: next });
    } catch (err) {
      setPreviewSaveError(mondayErrorText(err));
      return;
    }
    preview.mutate(runId);
  }

  /** Saves the draft (with the step to resume at); the issues found, or null when the save failed. */
  async function saveDraft(target: MondayImportStep): Promise<string[] | null> {
    if (!mapping) return [];
    try {
      return (await saveDraftMutation.mutateAsync({ mapping, step: target })).issues;
    } catch (err) {
      setError(mondayErrorText(err));
      return null;
    }
  }

  async function goTo(target: MondayImportStep, boardId: string | null = null, personId: string | null = null) {
    setError("");
    setNotice("");
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
    } else {
      try {
        await saveStepMutation.mutateAsync(target);
      } catch (err) {
        setError(mondayErrorText(err));
        return;
      }
    }
    setFocusBoardId(boardId);
    setFocusPersonId(personId);
    setStep(target);
    if (target === "vista_previa") refreshPreview();
  }

  async function startExport() {
    setError("");
    try {
      await exportMutation.mutateAsync({
        token: token.trim() || null,
        boardIds: selectedBoardIds,
        updates: exportChoice.updates,
        files: exportChoice.files,
      });
    } catch (err) {
      setError(mondayErrorText(err));
    }
  }

  async function startApply() {
    setError("");
    try {
      await applyMutation.mutateAsync(runId);
    } catch (err) {
      setError(mondayErrorText(err));
    }
  }

  async function startRollback() {
    setError("");
    try {
      await rollbackMutation.mutateAsync(runId);
    } catch (err) {
      setError(mondayErrorText(err));
    }
  }

  async function startOver() {
    setError("");
    try {
      await onStartOver();
    } catch (err) {
      setError(mondayErrorText(err));
    }
  }

  /** ✕: saves the draft (if this step edits it) and leaves; "Continuar importación" resumes the run later. */
  async function close() {
    setError("");
    if (DRAFT_STEPS.includes(step) && mapping && !run.batchId) {
      const saved = await saveDraft(step);
      if (saved === null) return;
    }
    router.push(CLOSE_HREF);
  }

  async function complete() {
    setError("");
    try {
      await completeMutation.mutateAsync(undefined);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "forbidden" ? "No tienes permiso." : "No se pudo guardar. Intenta de nuevo.",
      );
      return;
    }
    router.replace("/inicio");
  }

  async function download() {
    setError("");
    if (mapping) {
      const saved = await saveDraft(step);
      if (saved === null) return;
    }
    try {
      const result = await downloadMutation.mutateAsync(runId);
      const url = URL.createObjectURL(new Blob([result.content], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(mondayErrorText(err));
    }
  }

  async function upload(file: File) {
    setError("");
    setNotice("");
    try {
      const result = await uploadMutation.mutateAsync(await file.text());
      if (result.issues.length > 0) {
        setIssues(result.issues);
        return;
      }
      // The upload replaced the draft on the server: read the run again and edit that draft.
      const fresh = await qc.fetchQuery({ ...mondayRunOptions(runId), staleTime: 0 });
      setMapping(fresh.mapping);
      setIssues([]);
      preview.reset();
      setNotice("Se cargó mapping.json.");
    } catch (err) {
      setError(mondayErrorText(err));
    }
  }

  // --- Render --------------------------------------------------------------------------------------------------

  const current = MONDAY_IMPORT_STEPS[stepIndex(step)];
  const previewData = preview.data?.preview ?? null;
  const previewError = previewSaveError || (preview.error ? mondayErrorText(preview.error) : "");
  const state = { connection, run, selectedBoardIds, mapping, preview: previewData };
  const needsData = step === "equivalencias" || step === "personas";
  const ready = Boolean(mapping && source && choices);
  const finished = run.batchStatus === "applied" || run.batchStatus === "rolled_back";
  const cards = useMemo(
    () => buildBoardCards({ connection, mapping, source, preview: previewData, reviewed: new Set(reviewed) }),
    [connection, mapping, source, previewData, reviewed],
  );
  const totals = selectionTotals(cards, selectedBoardIds);
  const exportRunning = isJobRunning(run.jobs.export);
  const mustExport = needsExport(Boolean(run.exported), run.boardIds ?? [], selectedBoardIds);
  const importBoards = (mapping?.boards ?? [])
    .filter((board) => board.strategy !== "skip")
    .map((board) => ({ id: board.mondayBoardId, name: board.name }));
  const readError = sourceQuery.error ? mondayErrorText(sourceQuery.error) : "";
  const shownError = error || readError;

  /** "Importar n tableros": exports the picked boards when they aren't the exported ones, else goes on to map them. */
  function importSelected() {
    if (mustExport) void startExport();
    else void goTo(nextStep("tableros"));
  }

  const closeButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cerrar"
      title="Cerrar (la importación se guarda)"
      disabled={isPending}
      onClick={() => void close()}
    >
      <X aria-hidden="true" />
    </Button>
  );

  // FE §3.10, frame `BienvenidaMonday`: the title row on the card surface and the full-width stepper
  // under it; the step chips' "go back" rule is the same as today's.
  const topBar = (
    <header className="sticky top-0 z-20 border-b bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="min-w-0 truncate text-lg font-semibold text-foreground">Importar de monday</h1>
          {closeButton}
        </div>
        <WizardStepper
          steps={MONDAY_IMPORT_STEPS}
          current={step}
          canJump={(target) => !isPending && canJumpTo(target, step, state)}
          onJump={(target) => void goTo(target)}
        />
      </div>
    </header>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {topBar}

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6 md:px-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">
            {current.label}
          </h2>
          <p className="text-sm text-muted-foreground">{current.description}</p>
        </div>
        {mapping && !finished ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => void download()}>
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
                if (file) void upload(file);
              }}
            />
          </div>
        ) : null}

        {/* Keyed by step so each step fades in; motion-safe keeps it still with prefers-reduced-motion. */}
        <div key={step} className="space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          {step === "conectar" ? (
            <ConnectStep
              token={token}
              onTokenChange={onTokenChange}
              hasServerToken={hasServerToken}
              connection={connection}
              onConnected={onConnected}
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
              onStartExport={() => void startExport()}
              isPending={isPending}
              mapping={mapping}
              onMappingChange={editMapping}
              cards={cards}
              source={source}
              choices={choices}
              onBoardOpened={markReviewed}
              onStatusCreated={addStatus}
              onStaffCreated={addStaff}
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
              onStatusCreated={addStatus}
            />
          ) : null}
          {step === "personas" && mapping && source && choices ? (
            <PeopleStep
              mapping={mapping}
              source={source}
              choices={choices}
              runId={runId}
              onMappingChange={editMapping}
              onStaffCreated={addStaff}
              focusPersonId={focusPersonId}
            />
          ) : null}
          {step === "opciones" && mapping ? (
            <OptionsStep mapping={mapping} info={optionsInfo} error={optionsError} onMappingChange={editMapping} />
          ) : null}
          {step === "vista_previa" ? (
            <PreviewStep
              preview={previewData}
              error={previewError}
              isPending={isPending}
              onRefresh={refreshPreview}
              onFix={(target, boardId, personId) => void goTo(target, boardId, personId ?? null)}
              runId={runId}
              positions={choices?.positions ?? []}
              onStaffCreated={(mondayUserId, member) => void staffCreatedInPreview(mondayUserId, member)}
            />
          ) : null}
          {step === "importar" ? (
            <ImportStep
              run={run}
              projects={projects}
              rollbackCheck={rollbackCheck}
              isPending={isPending}
              error={shownError}
              onStartApply={() => void startApply()}
              onStartRollback={() => void startRollback()}
              onFinish={() => void complete()}
              onStartNew={() => void startOver()}
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
        {shownError && step !== "importar" ? (
          <Alert variant="destructive">
            <AlertDescription>{shownError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <footer className="sticky bottom-0 z-20 border-t bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {finished ? null : (
              <Button variant="ghost" disabled={isPending} onClick={() => void complete()}>
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
              <Button variant="outline" disabled={isPending || anyJobRunning} onClick={() => void goTo(previousStep(step))}>
                Atrás
              </Button>
            ) : null}
            {step === "importar" && !run.batchId && !anyJobRunning ? (
              <Button variant="outline" disabled={isPending} onClick={() => void goTo("vista_previa")}>
                Atrás
              </Button>
            ) : null}
            {step !== "importar" ? (
              <Button
                disabled={isPending || anyJobRunning || !canAdvance(step, state)}
                aria-describedby={issues.length > 0 ? "monday-mapping-issues" : undefined}
                onClick={() => void goTo(nextStep(step))}
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
