"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ProjectAdminValue } from "@/components/proyectos/ProjectAdminFields";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { ProjectsAnaliticoLayout } from "@/components/widgets/ProjectsAnaliticoLayout";
import { ProjectsEsencialLayout } from "@/components/widgets/ProjectsEsencialLayout";
import { ProjectsVisualLayout } from "@/components/widgets/ProjectsVisualLayout";
import { submitProjectCreateAction, updateProjectAction } from "@/lib/actions/projects-actions";
import { isStrippedActionError, useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import { catalogOptions } from "@/lib/query/options/catalog";
import { projectCreateStartOptions, proyectosPageOptions } from "@/lib/query/options/proyectos";
import type { ProjectCreateInput, ProjectInput } from "@/lib/types/core";

import { NewProjectDialog } from "./NewProjectDialog";
import type { ProjectCreateAdminOptions } from "./project-create-form";

/** The URL param that opens the create dialog. */
export const NEW_PROJECT_PARAM = "nuevo";

function hasAdminValues(admin: ProjectAdminValue | undefined): admin is ProjectAdminValue {
  return Boolean(admin && (admin.clientId || admin.origin || admin.originStaffId));
}

/**
 * Sets (or removes) one search param of the current URL with
 * `history.replaceState`: the App Router mirrors it into `useSearchParams`
 * without a server render.
 */
function replaceSearchParam(pathname: string, key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const search = params.toString();
  window.history.replaceState(window.history.state, "", `${pathname}${search ? `?${search}` : ""}${window.location.hash}`);
}

type UpdateVars = { id: string; patch: Partial<ProjectInput> };

/**
 * /proyectos in three styles: the Estilo picks the whole layout (ADR 0004,
 * `PageStyleLayout`). Visual is `ProjectsVisualLayout` (#992: tramo summary,
 * attention cards, portfolio board and delivery timeline), Esencial is
 * `ProjectsEsencialLayout` (#993) and Analítico is `ProjectsAnaliticoLayout`
 * (#994: KPI strip, filter card and the portfolio grouped by tramo). Every
 * layout reads `qk.proyectos.list()` (prefetched by the page), so the first
 * render makes no client call. "Nuevo proyecto" (any layout) and `?nuevo=1`
 * open `NewProjectDialog`, whose admin options load only while it is open.
 */
export function ProjectsPortfolio() {
  const { data } = useSuspenseQuery(proyectosPageOptions());
  const { canSeeAdminData, canCreateProject, presaleAutoStart } = data;
  const canPickStartTramo = data.canPickStartTramo ?? false;

  const router = useRouter();
  const pathname = usePathname() ?? "/proyectos";
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Set once a create navigates away, so closing the dialog doesn't touch the URL of that navigation.
  const navigating = useRef(false);

  const wantsNew = searchParams?.get(NEW_PROJECT_PARAM) === "1";
  // `?nuevo=1` opens the dialog; closing it hides it right away, before the URL drops the param.
  const [newDismissed, setNewDismissed] = useState(false);
  const [prevWantsNew, setPrevWantsNew] = useState(wantsNew);
  if (wantsNew !== prevWantsNew) {
    setPrevWantsNew(wantsNew);
    if (wantsNew) setNewDismissed(false);
  }
  const open = canCreateProject && (dialogOpen || (wantsNew && !newDismissed));

  // Admin create options: lazy catalog queries, only for admins and only while the dialog is open.
  const loadAdminOptions = open && canSeeAdminData;
  const clientsQuery = useQuery({ ...catalogOptions.contacts("cliente"), enabled: loadAdminOptions });
  const staffQuery = useQuery({ ...catalogOptions.staff(), enabled: loadAdminOptions });
  const adminOptions = useMemo<ProjectCreateAdminOptions | null>(
    () =>
      canSeeAdminData
        ? {
            clients: (clientsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name })),
            staff: (staffQuery.data ?? []).map((s) => ({ id: s.id, name: s.name })),
          }
        : null,
    [canSeeAdminData, clientsQuery.data, staffQuery.data],
  );

  // "Tramo inicial" options (#1034): only for staff who can start tramos, only while the dialog is open.
  const startQuery = useQuery({ ...projectCreateStartOptions(), enabled: open && canPickStartTramo });
  const startOptions = canPickStartTramo ? (startQuery.data ?? null) : null;

  // The dialog shows create errors inline (its own copy), so the mutation shows no toast.
  const createProject = useActionMutation(submitProjectCreateAction, {
    // The starting tramo's tasks show in Tareas.
    invalidate: [qk.proyectos.list(), qk.catalog.projectOptions(), qk.inicio(), qk.tareas.all],
    onFormError: () => undefined,
  });
  const updateProject = useActionMutation(({ id, patch }: UpdateVars) => updateProjectAction(id, patch), {
    invalidate: ({ id, patch }) => [
      qk.proyectos.detail(id),
      qk.proyectos.list(),
      qk.catalog.projectOptions(),
      qk.inicio(),
      // A client set on the new project changes its Clientes tab.
      ...(patch.clientId ? [qk.proyectos.tab(id, "clientes")] : []),
    ],
    errorContext: { entity: "project" },
    // The project exists; the client and origin can be set from the ficha.
    onFormError: (text) => toast.error(`Proyecto creado, pero no se guardaron el cliente y el origen. ${text}`),
  });

  function openDialog() {
    setDialogOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setDialogOpen(next);
    if (!next && wantsNew) setNewDismissed(true);
    // Dropping `?nuevo` is a URL change only: no server render.
    if (!next && wantsNew && !navigating.current) replaceSearchParam(pathname, NEW_PROJECT_PARAM, null);
  }

  async function handleCreate(input: ProjectCreateInput, admin?: ProjectAdminValue) {
    let result: Awaited<ReturnType<typeof createProject.mutateAsync>>;
    try {
      // An `{ ok: false, error }` result is thrown as `Error(error)` by the mutation.
      result = await createProject.mutateAsync(input);
    } catch (err) {
      // The dialog maps the code to copy (FE §9); a production-stripped message gets the generic copy.
      throw isStrippedActionError(err) ? new Error("") : err;
    }
    const id = result.project.id;
    if (canSeeAdminData && hasAdminValues(admin)) {
      try {
        await updateProject.mutateAsync({ id, patch: admin });
      } catch {
        // The error toast is shown by the mutation; the ficha has the fields.
        navigating.current = true;
        router.push(`/proyectos/${id}/ficha`);
        return;
      }
    }
    toast.success("Proyecto creado");
    navigating.current = true;
    router.push(`/proyectos/${id}`);
  }

  return (
    <>
      <PageStyleLayout
        visual={() => <ProjectsVisualLayout onNewProject={openDialog} />}
        esencial={() => <ProjectsEsencialLayout onNewProject={openDialog} />}
        analitico={() => <ProjectsAnaliticoLayout onNewProject={openDialog} />}
      />
      {canCreateProject ? (
        <NewProjectDialog
          open={open}
          onOpenChange={handleOpenChange}
          onConfirm={handleCreate}
          presaleAutoStart={presaleAutoStart}
          adminOptions={adminOptions}
          startOptions={startOptions}
        />
      ) : null}
    </>
  );
}
