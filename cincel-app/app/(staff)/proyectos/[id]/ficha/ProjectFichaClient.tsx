"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { AccordionPanels } from "@/components/ui/AccordionPanels";
import { Badge } from "@/components/ui/shadcn/badge";
import { statusColorToken, taskStatusLabel } from "@/lib/tasks/status-options";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { DriveLinksEditor } from "@/components/ui/DriveLinksEditor";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { ProjectAdminFields, projectAdminPatch, type ProjectAdminValue } from "@/components/proyectos/ProjectAdminFields";
import { ProjectBitacoraCard } from "@/components/proyectos/ProjectBitacoraCard";
import { canRemapImport, RemapImportSheet } from "@/components/proyectos/RemapImportSheet";
import { ProjectTramosCard } from "@/components/proyectos/ProjectTramosCard";
import { ProjectSpacesCard } from "@/components/proyectos/ProjectSpacesCard";
import { groupFichaTasks, hasTasksWithoutTramo, NO_PHASE_LABEL } from "@/lib/proyectos/task-groups";
import { hasImportData, ImportDataPanel, useImportData } from "@/components/ui/ImportDataPanel";
import { useGoogleConnectResult } from "@/lib/google/use-google-connect-result";

import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { canSeeAdminData, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import {
  setProjectMembersAction,
  setProjectContactsAction,
  addProjectLinkAction,
  removeProjectLinkAction,
} from "@/lib/actions/projects-actions";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogContactsOptions, catalogStaffOptions, catalogTramosOptions } from "@/lib/query/options/catalog";
import { proyectoFichaOptions } from "@/lib/query/options/proyectos";
import { useUpdateProjectMutation } from "@/lib/proyectos/ficha-mutations";
import type { ProjectDetail, ProjectLink, TaskLinkInput } from "@/lib/types/core";

const NO_VALUE = "__none__";

/** Spanish copy for a failed link add: the action's own copy, or the copy for its code. */
function linkErrorText(err: unknown): string {
  if (err instanceof Error && err.message && actionErrorCode(err) === "") return err.message;
  return actionErrorText(err);
}

const PROJECT_STATUS_LABEL: Record<ProjectDetail["status"], string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

/** The page under `ProjectTabs`, inside the `AppShell` the staff layout mounts. */
function Frame({ tabs, children }: { tabs: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      {tabs}
      <div>{children}</div>
    </div>
  );
}

export type ProjectFichaClientProps = {
  projectId: string;
  /** `ProjectTabs` of the project shell (FE §3.5). */
  tabs: ReactNode;
};

/**
 * `/proyectos/[id]/ficha`: the project's ficha form. Reads
 * `qk.proyectos.tab(id,'ficha')` (prefetched by the page) and the editor's
 * catalogs (`catalog.staff`, `catalog.contacts()`, `catalog.tramos`), which
 * the page prefetches for editors. Every save is a `useActionMutation` that
 * updates only the keys it changes; edit drafts are local form state.
 */
export function ProjectFichaClient({ projectId, tabs }: ProjectFichaClientProps) {
  const googleConnectResult = useGoogleConnectResult();
  const importData = useImportData("project", projectId);
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const caps = useMemo(() => resolveProjectsCapabilities(authenticatedUser), [authenticatedUser]);
  const isAdmin = canSeeAdminData(authenticatedUser);

  const ficha = useQuery(proyectoFichaOptions(projectId));
  const staffQuery = useQuery({ ...catalogStaffOptions(), enabled: caps.canEditProjectGeneral });
  const contactsQuery = useQuery({ ...catalogContactsOptions(), enabled: caps.canEditProjectGeneral });
  const tramosQuery = useQuery({ ...catalogTramosOptions(), enabled: caps.canChangeProjectStage || isAdmin });

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ProjectDetail>>({});
  const [adminDraft, setAdminDraft] = useState<ProjectAdminValue>({ clientId: null, origin: null, originStaffId: null });
  const [confirmClientChange, setConfirmClientChange] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [remapOpen, setRemapOpen] = useState(false);
  const [remapNotice, setRemapNotice] = useState<string | null>(null);

  const fichaKey = qk.proyectos.tab(projectId, "ficha");
  // Edit mode closes as soon as the saved project is in the cache, not after the refetch.
  const update = useUpdateProjectMutation(projectId, { onFormError: setSaveError, onSaved: () => setIsEditing(false) });
  const setMembers = useActionMutation<Array<{ staffId: string; role?: string | null }>, void>(
    (members) => setProjectMembersAction(projectId, members),
    { invalidate: [fichaKey, qk.proyectos.resumen(projectId), qk.proyectos.list()] },
  );
  const setContacts = useActionMutation<Array<{ contactId: string; role?: string | null }>, void>(
    (contacts) => setProjectContactsAction(projectId, contacts),
    {
      invalidate: [
        fichaKey,
        qk.proyectos.resumen(projectId),
        qk.proyectos.list(),
        qk.proyectos.tab(projectId, "clientes"),
      ],
    },
  );
  const addLinkMutation = useActionMutation<TaskLinkInput, ProjectLink>(
    (input) => addProjectLinkAction(projectId, input),
    { invalidate: [fichaKey], onFormError: setLinkError },
  );
  const removeLinkMutation = useActionMutation<string, void>((linkId) => removeProjectLinkAction(projectId, linkId), {
    invalidate: [fichaKey],
  });

  const tasks = useMemo(() => ficha.data?.tasks ?? [], [ficha.data]);
  // Tramo → Fase (FE §3.5); admins also get the project's admin tasks.
  const taskGroups = useMemo(() => groupFichaTasks(tasks, { includeAdmin: isAdmin }), [tasks, isAdmin]);
  const staff = staffQuery.data ?? [];
  const allContacts = contactsQuery.data ?? [];
  const clients = allContacts.filter((c) => c.type === "cliente");
  const contacts = allContacts.filter((c) => c.type !== "cliente");

  if (ficha.isPending) {
    return (
      <Frame tabs={tabs}>
        <div className="space-y-3" aria-label="Ficha del proyecto">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Frame>
    );
  }

  const project = ficha.data?.project ?? null;
  if (!project) {
    return (
      <Frame tabs={tabs}>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">
            Proyecto no encontrado
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">No existe un proyecto con este identificador.</p>
          <Link href="/proyectos" className={`mt-4 ${buttonVariants()}`}>
            Volver a proyectos
          </Link>
        </div>
      </Frame>
    );
  }

  function startEditing() {
    if (!project || !caps.canEditProjectGeneral) return;
    setDraft({
      projectType: project.projectType,
      addressStreet: project.addressStreet,
      addressCity: project.addressCity,
      addressState: project.addressState,
      startDate: project.startDate,
      endDate: project.endDate,
      contractAmountMxn: project.contractAmountMxn,
      managerId: project.manager?.id ?? null,
      coordinatorId: project.coordinator?.id ?? null,
    });
    setAdminDraft({
      clientId: project.client?.id ?? null,
      origin: project.origin,
      originStaffId: project.originStaffId,
    });
    setSaveError(null);
    setIsEditing(true);
  }

  /** The admin draft picks a different client than the saved one. */
  function clientChanged(): boolean {
    if (!project || !isAdmin) return false;
    return (adminDraft.clientId ?? null) !== (project.client?.id ?? null);
  }

  function requestSave() {
    if (clientChanged()) {
      setConfirmClientChange(true);
      return;
    }
    saveEditing();
  }

  function saveEditing() {
    setConfirmClientChange(false);
    setSaveError(null);
    // Client and origin are admin-only: non-admins never send those keys (FORBIDDEN otherwise).
    const patch = isAdmin ? { ...draft, ...projectAdminPatch(adminDraft) } : draft;
    // The backend closes "Asignar cliente y origen" when a client is set (RD-10): the
    // invalidation refetches the ficha, admin tasks included.
    update.mutate(patch);
  }

  const saving = update.isPending;
  const draftClientName = adminDraft.clientId ? clients.find((c) => c.id === adminDraft.clientId)?.name ?? null : null;

  function toggleMember(staffId: string) {
    if (!project) return;
    const already = project.members.some((m) => m.id === staffId);
    const next = already
      ? project.members.filter((m) => m.id !== staffId).map((m) => ({ staffId: m.id, role: m.role }))
      : [...project.members.map((m) => ({ staffId: m.id, role: m.role })), { staffId, role: null }];
    setMembers.mutate(next);
  }

  function toggleContact(contactId: string) {
    if (!project) return;
    const already = project.contacts.some((c) => c.id === contactId);
    const next = already
      ? project.contacts.filter((c) => c.id !== contactId).map((c) => ({ contactId: c.id, role: c.role }))
      : [...project.contacts.map((c) => ({ contactId: c.id, role: c.role })), { contactId, role: null }];
    setContacts.mutate(next);
  }

  function addLink(input: TaskLinkInput) {
    setLinkError(null);
    // The action words its own validation copy; show it instead of the generic one.
    addLinkMutation.mutate(input, { onError: (err) => setLinkError(linkErrorText(err)) });
  }

  function removeLink(linkId: string) {
    removeLinkMutation.mutate(linkId);
  }

  return (
    <Frame tabs={tabs}>
        {remapNotice ? (
          <Alert className="mb-3">
            <AlertDescription>{remapNotice}</AlertDescription>
          </Alert>
        ) : null}

        {googleConnectResult ? (
          <p className={`mb-3 text-sm ${googleConnectResult.success ? "text-muted-foreground" : "text-destructive"}`}>
            {googleConnectResult.message}
          </p>
        ) : null}

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">Ficha</h2>
              <Badge variant="secondary">{PROJECT_STATUS_LABEL[project.status]}</Badge>
            </div>
            {isAdmin ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span>Cliente:</span>
                {project.client ? (
                  <Link href={`/directorio?contact=${project.client.id}`} className="underline">
                    {project.client.name}
                  </Link>
                ) : (
                  <>
                    <Badge variant="destructive">Por asignar</Badge>
                    {caps.canEditProjectGeneral && !isEditing ? (
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={startEditing}>
                        Asignar
                      </Button>
                    ) : null}
                  </>
                )}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {canRemapImport(authenticatedUser, project) && !isEditing ? (
              <Button variant="outline" onClick={() => setRemapOpen(true)}>
                Reacomodar importación
              </Button>
            ) : null}
            {caps.canEditProjectGeneral ? (
              isEditing ? (
                <>
                  <Button variant="outline" disabled={saving} onClick={() => setIsEditing(false)}>Cancelar</Button>
                  <Button disabled={saving} onClick={requestSave}>Guardar</Button>
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
              {isEditing && saveError ? (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              ) : null}
              {isEditing ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {isAdmin ? (
                    <ProjectAdminFields
                      value={adminDraft}
                      onChange={setAdminDraft}
                      clients={clients}
                      staff={staff}
                      projectHasClient={project.client !== null}
                    />
                  ) : null}
                  <FormField>
                    <Label className="block text-sm font-normal text-muted-foreground">Tipo de proyecto</Label>
                    <Input
                      value={draft.projectType ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, projectType: e.target.value }))}
                      className="mt-1"
                    />
                  </FormField>
                  <FormField>
                    <Label className="block text-sm font-normal text-muted-foreground">Calle</Label>
                    <Input
                      value={draft.addressStreet ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, addressStreet: e.target.value }))}
                      className="mt-1"
                    />
                  </FormField>
                  <FormField>
                    <Label className="block text-sm font-normal text-muted-foreground">Ciudad</Label>
                    <Input
                      value={draft.addressCity ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, addressCity: e.target.value }))}
                      className="mt-1"
                    />
                  </FormField>
                  <FormField>
                    <Label className="block text-sm font-normal text-muted-foreground">Fecha de inicio</Label>
                    <Input
                      type="date"
                      value={draft.startDate ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                      className="mt-1"
                    />
                  </FormField>
                  <FormField>
                    <Label className="block text-sm font-normal text-muted-foreground">Encargado</Label>
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
                  </FormField>
                </div>
              ) : (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                  <div><dt className="text-muted-foreground">Tipo</dt><dd>{project.projectType || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Dirección</dt><dd>{[project.addressStreet, project.addressCity, project.addressState].filter(Boolean).join(", ") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Inicio</dt><dd>{project.startDate || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Encargado</dt><dd>{project.manager?.name ?? "Sin encargado"}</dd></div>
                  <div><dt className="text-muted-foreground">Coordinador</dt><dd>{project.coordinator?.name ?? "Sin encargado"}</dd></div>
                  {isAdmin ? (
                    <>
                      <div><dt className="text-muted-foreground">Origen</dt><dd>{project.origin || "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Quién trajo el proyecto</dt><dd>{project.originStaff?.name ?? "Nadie del equipo"}</dd></div>
                    </>
                  ) : null}
                </dl>
              )}
            </section>

            <ProjectTramosCard
              project={project}
              workflows={tramosQuery.data ?? []}
              canChangeTramo={caps.canChangeProjectStage}
              isAdmin={isAdmin}
              hasTasksWithoutTramo={hasTasksWithoutTramo(tasks)}
            />

            <ProjectSpacesCard projectId={project.id} canEdit={caps.canEditProjectGeneral} />

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Tareas ({tasks.length})</h2>
              {tasks.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">Sin tareas todavía.</p>
              ) : (
                <AccordionPanels
                  groups={taskGroups.map((group) => ({
                    id: group.id,
                    title: group.name,
                    count: group.count,
                    content: (
                      <div className="border-t border-border">
                        {group.phases.map((phaseGroup) => (
                          <div key={phaseGroup.id}>
                            {group.kind === "tramo" ? (
                              <div className="bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                                {phaseGroup.phase ? phaseGroup.name : <Badge variant="outline">{NO_PHASE_LABEL}</Badge>}
                              </div>
                            ) : null}
                            <ul className="divide-y divide-border text-sm">
                              {phaseGroup.tasks.map((t) => (
                                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
                                  <span>
                                    {t.title}
                                    {t.space ? <span className="ml-2 text-xs text-muted-foreground">{t.space.name}</span> : null}
                                  </span>
                                  <div className="flex shrink-0 items-center gap-3">
                                    <StatusBadge label={taskStatusLabel(t)} token={statusColorToken(t)} />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ),
                  }))}
                />
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Enlaces de Drive</h2>
              {linkError ? (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{linkError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="mt-4">
                <DriveLinksEditor
                  links={project.links}
                  onAdd={caps.canEditProtectedProjectData ? addLink : undefined}
                  onRemove={caps.canEditProtectedProjectData ? removeLink : undefined}
                />
              </div>
            </section>

            <ProjectBitacoraCard projectId={project.id} />

            {hasImportData(importData) ? (
              <section className="rounded-2xl border border-border bg-card px-6 py-2 shadow-sm">
                <ImportDataPanel importData={importData} />
              </section>
            ) : null}
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Equipo del proyecto</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {caps.canEditProjectGeneral
                  ? staff.map((s) => {
                      const isMember = project.members.some((m) => m.id === s.id);
                      return (
                        <li key={s.id} className="flex items-center justify-between">
                          <span>{s.name}</span>
                          <Button
                            variant={isMember ? "destructive" : "outline"}
                            size="sm"
                            disabled={setMembers.isPending}
                            onClick={() => toggleMember(s.id)}
                          >
                            {isMember ? "Quitar" : "Agregar"}
                          </Button>
                        </li>
                      );
                    })
                  : project.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between">
                        <span>{m.name}</span>
                        <Badge variant="secondary">En equipo</Badge>
                      </li>
                    ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Socios y proveedores</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {caps.canEditProjectGeneral
                  ? contacts.map((c) => {
                      const isLinked = project.contacts.some((pc) => pc.id === c.id);
                      return (
                        <li key={c.id} className="flex items-center justify-between">
                          <span>{c.name}</span>
                          <Button
                            variant={isLinked ? "destructive" : "outline"}
                            size="sm"
                            disabled={setContacts.isPending}
                            onClick={() => toggleContact(c.id)}
                          >
                            {isLinked ? "Quitar" : "Agregar"}
                          </Button>
                        </li>
                      );
                    })
                  : project.contacts.map((c) => (
                      <li key={c.id} className="flex items-center justify-between">
                        <span>{c.name}</span>
                        <Badge variant="secondary">Vinculado</Badge>
                      </li>
                    ))}
              </ul>
            </section>
          </div>
        </div>

        <AlertDialog open={confirmClientChange} onOpenChange={(next) => (next ? undefined : setConfirmClientChange(false))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cambiar el cliente del proyecto?</AlertDialogTitle>
              <AlertDialogDescription>
                El cliente de «{project.name}» pasará de {project.client?.name ?? "sin cliente"} a{" "}
                {draftClientName ?? "sin cliente"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={saving} onClick={saveEditing}>
                Cambiar cliente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {canRemapImport(authenticatedUser, project) ? (
          <RemapImportSheet
            projectId={project.id}
            open={remapOpen}
            onOpenChange={setRemapOpen}
            onApplied={(updated) => setRemapNotice(`Se reacomodaron ${updated} tareas.`)}
          />
        ) : null}
    </Frame>
  );
}
