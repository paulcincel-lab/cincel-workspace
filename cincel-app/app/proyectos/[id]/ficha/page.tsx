"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { AccordionPanels } from "@/components/ui/AccordionPanels";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import { Badge } from "@/components/ui/shadcn/badge";
import { BASE_STATUS_VARIANT, taskStatusLabel } from "@/lib/tasks/status-options";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { normalizePhases, projectPhaseOptions } from "@/lib/proyectos/phases";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import DrivePickerDialog, { type DrivePickerEntry } from "@/components/recursos/DrivePickerDialog";
import { useGoogleConnectResult } from "@/lib/google/use-google-connect-result";
import { useDriveEnabled } from "@/lib/google/use-drive-enabled";

import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import {
  fetchProjectAction,
  updateProjectAction,
  setProjectStagesAction,
  setProjectMembersAction,
  setProjectContactsAction,
  setProjectLinkAction,
  previewApplyWorkflowAction,
  applyWorkflowAction,
} from "@/lib/actions/projects-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { fetchContactsAction } from "@/lib/actions/contacts-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import type {
  ApplyWorkflowPreview,
  ContactListItem,
  ProjectDetail,
  Staff,
  TaskListItem,
  Workflow,
} from "@/lib/types/core";

const PROJECT_LINK_KINDS: Array<{ key: string; label: string }> = [
  { key: "administrativo", label: "Administrativo" },
  { key: "planos", label: "Planos" },
  { key: "renders", label: "Renders" },
  { key: "reportes", label: "Reportes" },
];

const NO_VALUE = "__none__";

const PROJECT_STATUS_LABEL: Record<ProjectDetail["status"], string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

export default function ProjectFichaPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const googleConnectResult = useGoogleConnectResult();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);

  // Group by Fase in order of first appearance; tasks without one go last.
  const phaseGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; tasks: TaskListItem[] }>();
    for (const task of tasks) {
      const name = task.phase?.trim() || "Sin fase";
      const group = groups.get(name) ?? { id: name, name, tasks: [] };
      group.tasks.push(task);
      groups.set(name, group);
    }
    return [...groups.values()].sort((a, b) => Number(a.name === "Sin fase") - Number(b.name === "Sin fase"));
  }, [tasks]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ProjectDetail>>({});
  const [drivePickerFor, setDrivePickerFor] = useState<string | null>(null);
  const [applyPreview, setApplyPreview] = useState<ApplyWorkflowPreview | null>(null);
  const [applyWorkflowId, setApplyWorkflowId] = useState("");
  const [customPhase, setCustomPhase] = useState("");
  const driveEnabled = useDriveEnabled();
  const authenticatedUser = getCurrentAuthenticatedUser();
  const caps = useMemo(() => resolveProjectsCapabilities(authenticatedUser), [authenticatedUser]);

  async function reload() {
    try {
      const [row, taskRows, staffRows, contactRows, workflowRows] = await Promise.all([
        fetchProjectAction(projectId),
        fetchTasksAction({ projectId }),
        fetchStaffAction(),
        fetchContactsAction(),
        fetchWorkflowsAction(),
      ]);
      if (!row) {
        setNotFound(true);
        return;
      }
      setProject(row);
      setTasks(taskRows);
      setStaff(staffRows);
      setContacts(contactRows.filter((c) => c.type !== "cliente"));
      setWorkflows(workflowRows);
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load the project on mount and whenever the route id changes — reload()
    // is also reused by the save handlers, so it can't be inlined here
    // without duplicating the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) {
    return (
      <main className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-10">
          <Header />
          <p className="text-sm text-muted-foreground">Cargando proyecto…</p>
        </section>
      </main>
    );
  }

  if (notFound || !project) {
    return (
      <main className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-10">
          <Header />
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-foreground">Proyecto no encontrado</h1>
            <p className="mt-2 text-sm text-muted-foreground">No existe un proyecto con este identificador.</p>
            <Link href="/proyectos" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/80">
              Volver a proyectos
            </Link>
          </div>
        </section>
      </main>
    );
  }

  function startEditing() {
    if (!project || !caps.canEditProjectGeneral) return;
    setDraft({
      projectType: project.projectType,
      phases: project.phases,
      addressStreet: project.addressStreet,
      addressCity: project.addressCity,
      addressState: project.addressState,
      startDate: project.startDate,
      endDate: project.endDate,
      contractAmountMxn: project.contractAmountMxn,
      managerId: project.manager?.id ?? null,
      coordinatorId: project.coordinator?.id ?? null,
    });
    setIsEditing(true);
  }

  async function saveEditing() {
    if (!project) return;
    try {
      await updateProjectAction(project.id, draft);
      setIsEditing(false);
      await reload();
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    }
  }

  async function toggleStage(workflowId: string) {
    if (!project) return;
    const current = project.stages.map((s) => s.id);
    const next = current.includes(workflowId) ? current.filter((id) => id !== workflowId) : [...current, workflowId];
    if (next.length === 0) return; // a project always keeps at least one stage
    try {
      await setProjectStagesAction(project.id, next);
      await reload();
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    }
  }

  function toggleDraftPhase(phase: string) {
    setDraft((d) => {
      const current = d.phases ?? [];
      const has = current.some((p) => p.toLowerCase() === phase.toLowerCase());
      return { ...d, phases: has ? current.filter((p) => p.toLowerCase() !== phase.toLowerCase()) : [...current, phase] };
    });
  }

  function addCustomPhase() {
    const value = customPhase.trim();
    if (!value) return;
    setDraft((d) => ({ ...d, phases: normalizePhases([...(d.phases ?? []), value]) }));
    setCustomPhase("");
  }

  async function toggleMember(staffId: string) {
    if (!project) return;
    const already = project.members.some((m) => m.id === staffId);
    const next = already
      ? project.members.filter((m) => m.id !== staffId).map((m) => ({ staffId: m.id, role: m.role }))
      : [...project.members.map((m) => ({ staffId: m.id, role: m.role })), { staffId, role: null }];
    try {
      await setProjectMembersAction(project.id, next);
      await reload();
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    }
  }

  async function toggleContact(contactId: string) {
    if (!project) return;
    const already = project.contacts.some((c) => c.id === contactId);
    const next = already
      ? project.contacts.filter((c) => c.id !== contactId).map((c) => ({ contactId: c.id, role: c.role }))
      : [...project.contacts.map((c) => ({ contactId: c.id, role: c.role })), { contactId, role: null }];
    try {
      await setProjectContactsAction(project.id, next);
      await reload();
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    }
  }

  async function pickDriveEntry(entry: DrivePickerEntry) {
    if (!project || !drivePickerFor) return;
    try {
      await setProjectLinkAction(project.id, drivePickerFor, {
        url: entry.webViewLink,
        title: entry.name,
        drive: {
          googleFileId: entry.id,
          fileName: entry.name,
          mimeType: entry.mimeType,
          iconLink: entry.iconLink,
          thumbnailLink: entry.thumbnailLink,
          webViewLink: entry.webViewLink,
          syncedAt: new Date().toISOString(),
        },
      });
      setDrivePickerFor(null);
      await reload();
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    }
  }

  async function openApplyPreview() {
    if (!project || !applyWorkflowId) return;
    const preview = await previewApplyWorkflowAction(project.id, applyWorkflowId);
    setApplyPreview(preview);
  }

  async function confirmApply() {
    if (!project || !applyWorkflowId) return;
    try {
      await applyWorkflowAction(project.id, applyWorkflowId, { managerId: project.manager?.id });
      setApplyPreview(null);
      await reload();
    } catch (err) {
      if (err instanceof RepositoryError) reportRepositoryError(err);
    }
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        {googleConnectResult ? (
          <p className={`mb-3 text-sm ${googleConnectResult.success ? "text-muted-foreground" : "text-destructive"}`}>
            {googleConnectResult.message}
          </p>
        ) : null}

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              <Badge variant="secondary">{PROJECT_STATUS_LABEL[project.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Cliente:{" "}
              <Link href={`/directorio?contact=${project.client.id}`} className="underline">
                {project.client.name}
              </Link>
            </p>
          </div>
          <div className="flex gap-2">
            {caps.canEditProjectGeneral ? (
              isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>Cancelar</Button>
                  <Button onClick={() => void saveEditing()}>Guardar</Button>
                </>
              ) : (
                <Button variant="outline" onClick={startEditing}>Editar</Button>
              )
            ) : null}
            {isEditing ? null : (
              <Link href="/proyectos" className={buttonVariants({ variant: "outline" })}>
                Cerrar
              </Link>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Datos generales</h2>
              {isEditing ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Label className="text-sm font-normal text-muted-foreground">
                    Tipo de proyecto
                    <Input
                      value={draft.projectType ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, projectType: e.target.value }))}
                      className="mt-1"
                    />
                  </Label>
                  <fieldset className="text-sm text-muted-foreground sm:col-span-2">
                    <legend>Fases (puedes elegir varias)</legend>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                      {projectPhaseOptions(draft.phases ?? []).map((phase) => (
                        <label key={phase} className="flex items-center gap-2 text-foreground">
                          <Checkbox
                            checked={(draft.phases ?? []).some((p) => p.toLowerCase() === phase.toLowerCase())}
                            onCheckedChange={() => toggleDraftPhase(phase)}
                          />
                          {phase}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={customPhase}
                        onChange={(e) => setCustomPhase(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomPhase();
                          }
                        }}
                        placeholder="Otra fase…"
                        className="h-8 max-w-xs"
                      />
                      <Button type="button" variant="outline" size="sm" className="h-8" onClick={addCustomPhase}>
                        Agregar fase
                      </Button>
                    </div>
                  </fieldset>
                  <Label className="text-sm font-normal text-muted-foreground">
                    Calle
                    <Input
                      value={draft.addressStreet ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, addressStreet: e.target.value }))}
                      className="mt-1"
                    />
                  </Label>
                  <Label className="text-sm font-normal text-muted-foreground">
                    Ciudad
                    <Input
                      value={draft.addressCity ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, addressCity: e.target.value }))}
                      className="mt-1"
                    />
                  </Label>
                  <Label className="text-sm font-normal text-muted-foreground">
                    Fecha de inicio
                    <Input
                      type="date"
                      value={draft.startDate ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                      className="mt-1"
                    />
                  </Label>
                  <Label className="text-sm font-normal text-muted-foreground">
                    Encargado
                    <Select
                      items={{ [NO_VALUE]: "Sin encargado", ...Object.fromEntries(staff.map((s) => [s.id, s.name])) }}
                      value={draft.managerId ?? NO_VALUE}
                      onValueChange={(v) => setDraft((d) => ({ ...d, managerId: v === NO_VALUE ? null : (v as string) }))}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VALUE}>Sin encargado</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Label>
                </div>
              ) : (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                  <div><dt className="text-muted-foreground">Tipo</dt><dd>{project.projectType || "—"}</dd></div>
                  <div>
                    <dt className="text-muted-foreground">Fases</dt>
                    <dd className="mt-0.5 flex flex-wrap gap-1">
                      {project.phases.length > 0
                        ? project.phases.map((phase) => <Badge key={phase} variant="outline">{phase}</Badge>)
                        : "—"}
                    </dd>
                  </div>
                  <div><dt className="text-muted-foreground">Dirección</dt><dd>{[project.addressStreet, project.addressCity, project.addressState].filter(Boolean).join(", ") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Inicio</dt><dd>{project.startDate || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Encargado</dt><dd>{project.manager?.name ?? "Sin encargado"}</dd></div>
                  <div><dt className="text-muted-foreground">Coordinador</dt><dd>{project.coordinator?.name ?? "Sin encargado"}</dd></div>
                </dl>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Etapas</h2>
                <div className="flex flex-wrap gap-1">
                  {project.stages.length > 0
                    ? project.stages.map((stage) => <Badge key={stage.id} variant="outline">{stage.name}</Badge>)
                    : <Badge variant="outline">Sin etapa</Badge>}
                </div>
              </div>
              {caps.canChangeProjectStage ? (
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2" role="group" aria-label="Etapas del proyecto">
                  {workflows.map((w) => {
                    const checked = project.stages.some((s) => s.id === w.id);
                    const isOnlyStage = checked && project.stages.length === 1;
                    return (
                      <label key={w.id} className="flex items-center gap-2 text-sm text-foreground" title={isOnlyStage ? "Un proyecto necesita al menos una etapa" : undefined}>
                        <Checkbox checked={checked} disabled={isOnlyStage} onCheckedChange={() => void toggleStage(w.id)} />
                        {w.name}
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {caps.canChangeProjectStage ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Select
                    items={Object.fromEntries(workflows.map((w) => [w.id, w.name]))}
                    value={applyWorkflowId}
                    onValueChange={(v) => setApplyWorkflowId(v as string)}
                  >
                    <SelectTrigger className="w-56"><SelectValue placeholder="Aplicar workflow" /></SelectTrigger>
                    <SelectContent>
                      {workflows.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" disabled={!applyWorkflowId} onClick={() => void openApplyPreview()}>
                    Ver preview
                  </Button>
                </div>
              ) : null}

              {applyPreview ? (
                <div className="mt-4 rounded-lg border border-border p-4 text-sm">
                  <p className="font-medium">{applyPreview.workflow.name}</p>
                  <p className="mt-2 text-muted-foreground">Se crearán {applyPreview.create.length} tareas:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {applyPreview.create.map((t) => <li key={t.id}>{t.title}</li>)}
                  </ul>
                  {applyPreview.skip.length > 0 ? (
                    <p className="mt-2 text-muted-foreground">Ya aplicadas ({applyPreview.skip.length}): {applyPreview.skip.map((t) => t.title).join(", ")}</p>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={() => setApplyPreview(null)}>Cancelar</Button>
                    <Button onClick={() => void confirmApply()}>Confirmar</Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Tareas ({tasks.length})</h2>
              {tasks.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">Sin tareas todavía.</p>
              ) : (
                <AccordionPanels
                  groups={phaseGroups.map((group) => ({
                    id: group.id,
                    title: group.name,
                    count: group.tasks.length,
                    content: (
                      <ul className="divide-y divide-border border-t border-border text-sm">
                        {group.tasks.map((t) => (
                          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
                            <span>{t.title}</span>
                            <div className="flex shrink-0 items-center gap-3">
                              <ChecklistProgressCell total={t.checklist.total} completed={t.checklist.completed} />
                              <Badge variant={BASE_STATUS_VARIANT[t.status]}>{taskStatusLabel(t)}</Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ),
                  }))}
                />
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Enlaces de Drive</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {PROJECT_LINK_KINDS.map((kind) => {
                  const link = project.links.find((l) => l.kind === kind.key);
                  return (
                    <div key={kind.key} className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-medium">{kind.label}</p>
                      {link ? (
                        <a href={link.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-primary underline">
                          {link.title || link.url}
                        </a>
                      ) : (
                        <p className="mt-1 text-muted-foreground">Sin vincular</p>
                      )}
                      {driveEnabled ? (
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => setDrivePickerFor(kind.key)}>
                          Elegir de Drive
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Equipo del proyecto</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {staff.map((s) => {
                  const isMember = project.members.some((m) => m.id === s.id);
                  return (
                    <li key={s.id} className="flex items-center justify-between">
                      <span>{s.name}</span>
                      {caps.canEditProjectGeneral ? (
                        <Button variant={isMember ? "destructive" : "outline"} size="sm" onClick={() => void toggleMember(s.id)}>
                          {isMember ? "Quitar" : "Agregar"}
                        </Button>
                      ) : (
                        isMember ? <Badge variant="secondary">En equipo</Badge> : null
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Socios y proveedores</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {contacts.map((c) => {
                  const isLinked = project.contacts.some((pc) => pc.id === c.id);
                  return (
                    <li key={c.id} className="flex items-center justify-between">
                      <span>{c.name}</span>
                      {caps.canEditProjectGeneral ? (
                        <Button variant={isLinked ? "destructive" : "outline"} size="sm" onClick={() => void toggleContact(c.id)}>
                          {isLinked ? "Quitar" : "Agregar"}
                        </Button>
                      ) : (
                        isLinked ? <Badge variant="secondary">Vinculado</Badge> : null
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>

        {drivePickerFor ? (
          <DrivePickerDialog
            open
            onClose={() => setDrivePickerFor(null)}
            onPick={(entry) => void pickDriveEntry(entry)}
          />
        ) : null}
      </section>
    </main>
  );
}
