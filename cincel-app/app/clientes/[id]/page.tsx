"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AppBadge from "@/components/ui/AppBadge";
import AppAvatar from "@/components/ui/AppAvatar";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import { projects as baseProjects } from "@/lib/data/projects";
import { getProjectsSnapshot, fetchProjects, saveProjects } from "@/lib/repositories/projects-repository";
import { getClientsSnapshot, saveClients, deleteClientAndLinkedProjects, fetchClients } from "@/lib/repositories/clients-repository";
import { getClientHistoryByClientId, fetchClientHistory, appendClientHistory, type ClientHistoryEntry } from "@/lib/repositories/client-history-repository";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";

type ClientKind = "Empresa" | "Particular";

type ManualClient = {
  id: number;
  name: string;
  emails: string[];
  phone: string;
  kind: ClientKind;
  contacts: Array<{
    name: string;
    role: string;
    phone: string;
    email: string;
  }>;
  completedProjects: string[];
  acquisitionChannel: string;
  totalSpent: number;
  hasActiveProject: boolean;
  projectName: string;
  projectType: string;
  totalProjectsWorked: number;
  firstWorkDate: string;
};

type ClientContact = {
  name: string;
  role: string;
  phone: string;
  email: string;
};

type ClientDraft = {
  name: string;
  emailsText: string;
  phone: string;
  kind: ClientKind;
  acquisitionChannel: string;
  totalSpent: number;
  hasActiveProject: boolean;
  firstWorkDate: string;
  projectName: string;
  projectType: string;
  totalProjectsWorked: number;
  completedProjectsText: string;
  contacts: ClientContact[];
};

const projectTypeOptions = ["Habitacional", "Oficina", "Mobiliario", "Comercial", "Mantenimiento", "Otro"];

function statusBadgeColor(active: boolean): "yellow" | "green" | "blue" | "red" | "gray" | "purple" {
  return active ? "green" : "gray";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function loadPersistedProjects() {
  const parsed = getProjectsSnapshot() as Array<Partial<(typeof baseProjects)[number]>>;

  if (!Array.isArray(parsed)) {
    return baseProjects;
  }

    return parsed
      .map((item) => {
        const fallback = baseProjects.find((project) => project.id === item.id || project.code === item.code || project.name === item.name);

        if (fallback) {
          const incomingClient = item.client as Partial<typeof fallback.client> | undefined;

          return {
            ...fallback,
            ...item,
            client: {
              ...fallback.client,
              ...incomingClient,
              emails: Array.isArray(incomingClient?.emails)
                ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0)
                : fallback.client.emails,
              phone: typeof incomingClient?.phone === "string" ? incomingClient.phone : fallback.client.phone,
              kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular"
                ? incomingClient.kind
                : fallback.client.kind,
              contacts: Array.isArray(incomingClient?.contacts)
                ? incomingClient.contacts
                  .filter((contact): contact is { name: string; role: string; phone: string; email: string } =>
                    Boolean(contact)
                    && typeof contact.name === "string"
                    && typeof contact.role === "string"
                    && typeof contact.phone === "string"
                    && typeof contact.email === "string"
                  )
                : Array.isArray(fallback.client.contacts)
                  ? fallback.client.contacts
                  : [],
              completedProjects: Array.isArray(incomingClient?.completedProjects)
                ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                : Array.isArray(fallback.client.completedProjects)
                  ? fallback.client.completedProjects
                  : [],
              acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string"
                ? incomingClient.acquisitionChannel
                : fallback.client.acquisitionChannel,
              totalSpent: typeof incomingClient?.totalSpent === "number"
                ? incomingClient.totalSpent
                : fallback.client.totalSpent,
            },
            startDate: typeof item.startDate === "string" && item.startDate ? item.startDate : fallback.startDate,
          };
        }

        const incomingClient = item.client as Partial<(typeof baseProjects)[number]["client"]> | undefined;
        const clientId = typeof incomingClient?.id === "number"
          ? incomingClient.id
          : typeof item.id === "number"
            ? item.id
            : Date.now();

        return {
          id: typeof item.id === "number" ? item.id : Date.now(),
          code: typeof item.code === "string" && item.code ? item.code : `PRJ-${clientId}`,
          name: typeof item.name === "string" && item.name ? item.name : `Proyecto ${clientId}`,
          active: Boolean(item.active),
          status: typeof item.status === "string" && item.status ? item.status : (item.active ? "Activo" : "Inactivo"),
          client: {
            id: clientId,
            name: typeof incomingClient?.name === "string" && incomingClient.name ? incomingClient.name : "Cliente",
            emails: Array.isArray(incomingClient?.emails)
              ? incomingClient.emails.filter((email): email is string => typeof email === "string" && email.trim().length > 0)
              : [],
            phone: typeof incomingClient?.phone === "string" ? incomingClient.phone : "",
            kind: incomingClient?.kind === "Empresa" || incomingClient?.kind === "Particular"
              ? incomingClient.kind
              : "Particular",
            contacts: Array.isArray(incomingClient?.contacts)
              ? incomingClient.contacts
                .filter((contact): contact is { name: string; role: string; phone: string; email: string } =>
                  Boolean(contact)
                  && typeof contact.name === "string"
                  && typeof contact.role === "string"
                  && typeof contact.phone === "string"
                  && typeof contact.email === "string"
                )
              : [],
            completedProjects: Array.isArray(incomingClient?.completedProjects)
              ? incomingClient.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : [],
            acquisitionChannel: typeof incomingClient?.acquisitionChannel === "string"
              ? incomingClient.acquisitionChannel
              : "Sin registro",
            totalSpent: typeof incomingClient?.totalSpent === "number" ? incomingClient.totalSpent : 0,
          },
          type: typeof item.type === "string" && item.type ? item.type : "Otro",
          stage: typeof item.stage === "string" && item.stage ? item.stage : "Presale",
          phase: typeof item.phase === "string" && item.phase ? item.phase : "Inicial",
          address: {
            street: item.address && typeof item.address.street === "string" ? item.address.street : "",
            city: item.address && typeof item.address.city === "string" ? item.address.city : "",
            state: item.address && typeof item.address.state === "string" ? item.address.state : "",
          },
          manager: typeof item.manager === "string" && item.manager ? item.manager : "Sin responsable",
          coordinator: typeof item.coordinator === "string" && item.coordinator ? item.coordinator : "Sin responsable",
          team: Array.isArray(item.team) ? item.team.filter((member): member is string => typeof member === "string") : [],
          progress: typeof item.progress === "number" ? item.progress : 0,
          drive: {
            administrativo: item.drive && typeof item.drive.administrativo === "string" ? item.drive.administrativo : "",
            planos: item.drive && typeof item.drive.planos === "string" ? item.drive.planos : "",
            renders: item.drive && typeof item.drive.renders === "string" ? item.drive.renders : "",
            reportes: item.drive && typeof item.drive.reportes === "string" ? item.drive.reportes : "",
          },
          startDate: typeof item.startDate === "string" ? item.startDate : "",
        };
      })
      .filter((item): item is (typeof baseProjects)[number] => item !== null);
}

function loadManualClients(): ManualClient[] {
  const parsed = getClientsSnapshot() as ManualClient[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) => ({
      id: Number(item.id),
      name: item.name || "",
      emails: Array.isArray(item.emails) ? item.emails.filter(Boolean) : [],
      phone: item.phone || "",
      kind: item.kind === "Empresa" ? "Empresa" : "Particular",
      contacts: Array.isArray(item.contacts)
        ? item.contacts.filter((contact): contact is { name: string; role: string; phone: string; email: string } =>
          Boolean(contact)
          && typeof contact.name === "string"
          && typeof contact.role === "string"
          && typeof contact.phone === "string"
          && typeof contact.email === "string"
        )
        : [],
      completedProjects: Array.isArray(item.completedProjects)
        ? item.completedProjects.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      acquisitionChannel: typeof item.acquisitionChannel === "string" ? item.acquisitionChannel : "Sin registro",
      totalSpent: typeof item.totalSpent === "number" ? item.totalSpent : 0,
      hasActiveProject: Boolean(item.hasActiveProject),
      projectName: item.projectName || "",
      projectType: item.projectType || "Otro",
      totalProjectsWorked: Number.isFinite(Number(item.totalProjectsWorked)) ? Number(item.totalProjectsWorked) : 1,
      firstWorkDate: item.firstWorkDate || "",
    }));
}

function loadClientHistory(): Record<number, ClientHistoryEntry[]> {
  return getClientHistoryByClientId();
}

export default function ClienteFichaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = Number(params.id);

  const [projects, setProjects] = useState(() => loadPersistedProjects());
  const [manualClients, setManualClients] = useState(() => loadManualClients());
  const [showEditor, setShowEditor] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [historyByClient, setHistoryByClient] = useState<Record<number, ClientHistoryEntry[]>>(() => loadClientHistory());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [draft, setDraft] = useState<ClientDraft>({
    name: "",
    emailsText: "",
    phone: "",
    kind: "Particular",
    acquisitionChannel: "Sin registro",
    totalSpent: 0,
    hasActiveProject: false,
    firstWorkDate: "",
    projectName: "",
    projectType: "Otro",
    totalProjectsWorked: 1,
    completedProjectsText: "",
    contacts: [],
  });

  useEffect(() => {
    let cancelled = false;
    void fetchProjects()
      .then((remote) => {
        if (!cancelled && remote.length > 0) setProjects(remote);
      })
      .catch(() => undefined);
    void fetchClients()
      .then((remote) => {
        if (!cancelled) setManualClients(remote);
      })
      .catch(() => undefined);
    void fetchClientHistory()
      .then((remote) => {
        if (!cancelled) setHistoryByClient(remote);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshAuthenticatedUser = () => {
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    window.addEventListener("focus", refreshAuthenticatedUser);
    window.addEventListener("storage", refreshAuthenticatedUser);

    return () => {
      window.removeEventListener("focus", refreshAuthenticatedUser);
      window.removeEventListener("storage", refreshAuthenticatedUser);
    };
  }, []);

  const clientsCapabilities = useMemo(() => {
    return resolveClientsCapabilities(authenticatedUser);
  }, [authenticatedUser]);

  if (!clientsCapabilities.canViewClients) {
    return (
      <main className="flex min-h-screen bg-slate-100">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-10">
          <Header />
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Sin acceso al modulo Clientes</h1>
            <p className="mt-2 text-sm text-slate-600">Tu acceso actual no permite visualizar informacion comercial de clientes.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Volver al dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const linkedProjects = projects.filter((project) => project.client.id === clientId);
  const manualClient = manualClients.find((client) => client.id === clientId) ?? null;

  const sourceClient = linkedProjects[0]?.client ?? manualClient;

  if (!sourceClient) {
    return (
      <main className="flex min-h-screen bg-slate-100">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-10">
          <Header />
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Cliente no encontrado</h1>
            <p className="mt-2 text-sm text-slate-600">No existe un cliente con ese identificador.</p>
            <Link href="/clientes" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Volver a clientes
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const hasActiveProject = linkedProjects.length > 0
    ? linkedProjects.some((project) => project.active)
    : Boolean(manualClient?.hasActiveProject);

  const firstWorkDate = linkedProjects.length > 0
    ? linkedProjects
      .map((project) => project.startDate)
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || "Sin fecha"
    : manualClient?.firstWorkDate || "Sin fecha";

  const totalProjects = linkedProjects.length > 0
    ? linkedProjects.length
    : Math.max(1, manualClient?.totalProjectsWorked || 1);

  const contacts = Array.isArray(sourceClient.contacts) ? sourceClient.contacts : [];
  const completedProjects = Array.isArray(sourceClient.completedProjects) && sourceClient.completedProjects.length > 0
    ? sourceClient.completedProjects
    : linkedProjects.map((project) => project.name);
  const acquisitionChannel = typeof sourceClient.acquisitionChannel === "string" ? sourceClient.acquisitionChannel : "Sin registro";
  const totalSpent = typeof sourceClient.totalSpent === "number" ? sourceClient.totalSpent : 0;
  const normalizedClientKind: ClientKind = sourceClient.kind === "Empresa" ? "Empresa" : "Particular";
  const historyEntries = historyByClient[clientId] ?? [];

  const appendHistory = (entries: Array<Omit<ClientHistoryEntry, "id" | "date" | "clientId">>) => {
    if (entries.length === 0) {
      return;
    }

    const nextEntries = entries.map((entry) => ({
      ...entry,
      id: `${clientId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      clientId,
      date: new Date().toISOString(),
    }));

    // Optimistic; the authoritative rows come back on the next hydrate.
    setHistoryByClient((current) => ({
      ...current,
      [clientId]: [...nextEntries, ...(current[clientId] ?? [])],
    }));

    void appendClientHistory(
      clientId,
      entries.map((e) => ({ field: e.field, before: e.before, after: e.after, author: e.author }))
    ).catch(() => undefined);
  };

  const openEditor = () => {
    if (!clientsCapabilities.canEditClient) {
      return;
    }

    setEditorError("");
    setDraft({
      name: sourceClient.name,
      emailsText: sourceClient.emails.join(", "),
      phone: sourceClient.phone,
      kind: normalizedClientKind,
      acquisitionChannel,
      totalSpent,
      hasActiveProject,
      firstWorkDate: firstWorkDate === "Sin fecha" ? "" : firstWorkDate,
      projectName: manualClient?.projectName || linkedProjects[0]?.name || "",
      projectType: manualClient?.projectType || linkedProjects[0]?.type || "Otro",
      totalProjectsWorked: totalProjects,
      completedProjectsText: completedProjects.join(", "),
      contacts: contacts.length > 0
        ? contacts
        : [{ name: "", role: "", phone: "", email: "" }],
    });
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditorError("");
  };

  const updateDraftContact = (index: number, updates: Partial<ClientContact>) => {
    setDraft((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact, contactIndex) => (
        contactIndex === index ? { ...contact, ...updates } : contact
      )),
    }));
  };

  const addDraftContact = () => {
    setDraft((prev) => ({
      ...prev,
      contacts: [...prev.contacts, { name: "", role: "", phone: "", email: "" }],
    }));
  };

  const removeDraftContact = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, contactIndex) => contactIndex !== index),
    }));
  };

  const saveClient = () => {
    if (!clientsCapabilities.canEditClient) {
      return;
    }

    const trimmedName = draft.name.trim();

    if (!trimmedName) {
      setEditorError("El nombre del cliente es obligatorio.");
      return;
    }

    const emails = draft.emailsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const normalizedContacts = draft.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        role: contact.role.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim(),
      }))
      .filter((contact) => contact.name || contact.role || contact.phone || contact.email);

    const completedProjectsList = draft.completedProjectsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const changeEntries: Array<Omit<ClientHistoryEntry, "id" | "date" | "clientId">> = [];

    const registerChange = (field: string, before: string, after: string) => {
      if (before !== after) {
        changeEntries.push({
          field,
          before,
          after,
          author: "Paul",
        });
      }
    };

    registerChange("Nombre", sourceClient.name, trimmedName);
    registerChange("Email(s)", sourceClient.emails.join(", "), emails.join(", "));
    registerChange("Contacto principal", sourceClient.phone || "", draft.phone.trim());
    registerChange("Empresa/Particular", normalizedClientKind, draft.kind);
    registerChange("Canal de llegada", acquisitionChannel, draft.acquisitionChannel.trim() || "Sin registro");
    registerChange("Monto gastado", String(totalSpent), String(Math.max(0, Number(draft.totalSpent) || 0)));
    registerChange("Proyecto activo", hasActiveProject ? "Si" : "No", draft.hasActiveProject ? "Si" : "No");
    registerChange("Fecha primer trabajo", firstWorkDate, draft.firstWorkDate || "Sin fecha");
    registerChange("Proyectos realizados", completedProjects.join(", "), completedProjectsList.join(", "));
    registerChange(
      "Contactos adicionales",
      contacts.map((contact) => `${contact.name}|${contact.role}|${contact.phone}|${contact.email}`).join(" || "),
      normalizedContacts.map((contact) => `${contact.name}|${contact.role}|${contact.phone}|${contact.email}`).join(" || ")
    );

    if (linkedProjects.length > 0) {
      const updatedProjects = projects.map((project) => (
        project.client.id === clientId
          ? {
              ...project,
              active: draft.hasActiveProject,
              status: draft.hasActiveProject ? "Activo" : "Inactivo",
              startDate: draft.firstWorkDate || project.startDate,
              client: {
                ...project.client,
                name: trimmedName,
                emails,
                phone: draft.phone.trim(),
                kind: draft.kind,
                contacts: normalizedContacts,
                completedProjects: completedProjectsList,
                acquisitionChannel: draft.acquisitionChannel.trim() || "Sin registro",
                totalSpent: Math.max(0, Number(draft.totalSpent) || 0),
              },
            }
          : project
      ));

      setProjects(updatedProjects);
      void saveProjects(updatedProjects);
    } else if (manualClient) {
      registerChange("Nombre de proyecto", manualClient.projectName || "", draft.projectName.trim());
      registerChange("Tipo de proyecto", manualClient.projectType || "", draft.projectType);
      registerChange("# proyectos con nosotros", String(Math.max(1, manualClient.totalProjectsWorked)), String(Math.max(1, Number(draft.totalProjectsWorked) || 1)));

      const updatedManualClients = manualClients.map((client) => (
        client.id === clientId
          ? {
              ...client,
              name: trimmedName,
              emails,
              phone: draft.phone.trim(),
              kind: draft.kind,
              contacts: normalizedContacts,
              completedProjects: completedProjectsList,
              acquisitionChannel: draft.acquisitionChannel.trim() || "Sin registro",
              totalSpent: Math.max(0, Number(draft.totalSpent) || 0),
              hasActiveProject: draft.hasActiveProject,
              firstWorkDate: draft.firstWorkDate,
              projectName: draft.projectName.trim(),
              projectType: draft.projectType,
              totalProjectsWorked: Math.max(1, Number(draft.totalProjectsWorked) || 1),
            }
          : client
      ));

      setManualClients(updatedManualClients);
      void saveClients(updatedManualClients);
    }

    appendHistory(changeEntries);

    closeEditor();
  };

  const deleteClient = async () => {
    if (!clientsCapabilities.canDeleteClient) {
      return;
    }

    const confirmed = window.confirm(
      `Se eliminara el cliente "${sourceClient.name}". Esta accion no se puede deshacer. Deseas continuar?`
    );

    if (!confirmed) {
      return;
    }

    const updatedProjects = projects.filter((project) => project.client.id !== clientId);
    const updatedManualClients = manualClients.filter((client) => client.id !== clientId);
    const removedProjectLegacyIds = projects
      .filter((project) => project.client.id === clientId)
      .map((project) => project.id);

    const previousProjects = projects;
    const previousManualClients = manualClients;

    // Refleja el cambio de inmediato en UI y snapshot local.
    setProjects(updatedProjects);
    setManualClients(updatedManualClients);

    try {
      await deleteClientAndLinkedProjects(clientId, removedProjectLegacyIds);

      // Reafirma snapshots locales tras persistir en fuente de verdad.
      void saveProjects(updatedProjects);
      void saveClients(updatedManualClients);

      router.push("/clientes");
    } catch (error) {
      // Revertimos el estado optimista si la persistencia falla.
      setProjects(previousProjects);
      setManualClients(previousManualClients);

      if (error instanceof RepositoryError) {
        reportRepositoryError(error);
      }

      return;
    }
  };

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Ficha del cliente</p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">{sourceClient.name}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={openEditor}
                disabled={!clientsCapabilities.canEditClient}
                title={clientsCapabilities.canEditClient ? "" : "No tienes permiso para editar clientes"}
              >
                Editar cliente
              </Button>

              <Button
                variant="outline"
                className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                onClick={deleteClient}
                disabled={!clientsCapabilities.canDeleteClient}
                title={clientsCapabilities.canDeleteClient ? "" : "No tienes permiso para eliminar clientes"}
              >
                Eliminar cliente
              </Button>

              <Link
                href="/clientes"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Volver a clientes
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-1">
              <AppAvatar name={sourceClient.name} />
              <p className="mt-2 text-xs text-slate-600">
                {sourceClient.emails.length > 0 ? sourceClient.emails.join(" · ") : "Sin correos registrados"}
              </p>
              <p className="mt-1 text-xs text-slate-600">{sourceClient.phone || "Sin numero de contacto"}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Empresa o Particular</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{normalizedClientKind}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Proyecto activo</p>
                  <div className="mt-1">
                    <AppBadge label={hasActiveProject ? "Si" : "No"} color={statusBadgeColor(hasActiveProject)} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500"># proyectos con nosotros</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{totalProjects}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fecha de primer trabajo</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{firstWorkDate}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Como llegaron a nosotros</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{acquisitionChannel}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Montos gastados</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{formatCurrency(totalSpent)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Contactos adicionales</h2>

            {contacts.length > 0 ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {contacts.map((contact, index) => (
                  <div key={`${contact.name}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-800">{contact.name || "Sin nombre"}</p>
                    <p className="mt-1 text-xs text-slate-600">{contact.role || "Sin rol"}</p>
                    <p className="mt-1 text-sm text-slate-700">{contact.phone || "Sin contacto"}</p>
                    <p className="mt-1 text-xs text-slate-600">{contact.email || "Sin correo"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No hay otros contactos registrados para este cliente.
              </div>
            )}
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Proyectos realizados con nosotros</h2>

            {completedProjects.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {completedProjects.map((projectName, index) => (
                  <span key={`${projectName}-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    {projectName}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No hay proyectos historicos registrados para este cliente.
              </div>
            )}
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Proyectos vinculados</h2>

            {linkedProjects.length > 0 ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {linkedProjects.map((project) => (
                  <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{project.name}</p>
                        <p className="text-xs text-slate-500">{project.type} · {project.stage}</p>
                      </div>
                      <AppBadge label={project.active ? "Activo" : "Inactivo"} color={statusBadgeColor(project.active)} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/proyectos/${project.id}/ficha`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Ficha de proyecto
                      </Link>
                      <Link href={`/tareas?project=${encodeURIComponent(project.name)}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Ver actividades
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Este cliente no tiene proyectos operativos vinculados.
              </div>
            )}
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Bitacora de cambios</h2>

            {historyEntries.length > 0 ? (
              <div className="mt-3 space-y-2">
                {historyEntries.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{entry.field}</p>
                      <p className="text-xs text-slate-500">{new Date(entry.date).toLocaleString("es-MX")}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{entry.before || "Vacio"}{" -> "}{entry.after || "Vacio"}</p>
                    <p className="mt-1 text-xs text-slate-500">Por: {entry.author}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Todavia no hay cambios registrados para este cliente.
              </div>
            )}
          </div>
        </div>

        <Sheet open={showEditor} onOpenChange={(next) => { if (!next) closeEditor(); }}>
          <SheetContent className="w-[672px] max-w-[672px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Editar cliente</SheetTitle>
              <p className="text-sm text-slate-500">Actualiza contactos, origen y montos del cliente.</p>
            </SheetHeader>

            <div className="space-y-4 px-6 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="edit-client-name">Nombre del cliente</Label>
                    <Input
                      id="edit-client-name"
                      value={draft.name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-client-phone">Numero de contacto principal</Label>
                    <Input
                      id="edit-client-phone"
                      value={draft.phone}
                      onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="edit-client-emails">Email(s)</Label>
                    <Input
                      id="edit-client-emails"
                      value={draft.emailsText}
                      onChange={(event) => setDraft((prev) => ({ ...prev, emailsText: event.target.value }))}
                      placeholder="correo1@dominio.com, correo2@dominio.com"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-client-kind">Empresa o Particular</Label>
                    <Select value={draft.kind} onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value as ClientKind }))}>
                      <SelectTrigger id="edit-client-kind" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Empresa">Empresa</SelectItem>
                        <SelectItem value="Particular">Particular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-client-acquisition-channel">Como llegaron a nosotros</Label>
                    <Input
                      id="edit-client-acquisition-channel"
                      value={draft.acquisitionChannel}
                      onChange={(event) => setDraft((prev) => ({ ...prev, acquisitionChannel: event.target.value }))}
                      placeholder="Recomendacion, pagina web, redes sociales..."
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="edit-client-total-spent">Montos gastados (MXN)</Label>
                    <Input
                      id="edit-client-total-spent"
                      type="number"
                      min={0}
                      value={draft.totalSpent}
                      onChange={(event) => setDraft((prev) => ({ ...prev, totalSpent: Number(event.target.value) || 0 }))}
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="edit-client-completed-projects">Proyectos realizados con nosotros</Label>
                    <Input
                      id="edit-client-completed-projects"
                      value={draft.completedProjectsText}
                      onChange={(event) => setDraft((prev) => ({ ...prev, completedProjectsText: event.target.value }))}
                      placeholder="Proyecto 1, Proyecto 2, Proyecto 3"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-client-has-active-project">Proyecto activo</Label>
                    <Select
                      value={draft.hasActiveProject ? "si" : "no"}
                      onValueChange={(value) => setDraft((prev) => ({ ...prev, hasActiveProject: value === "si" }))}
                    >
                      <SelectTrigger id="edit-client-has-active-project" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="si">Si</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-client-first-work-date">Fecha de primer trabajo</Label>
                    <Input
                      id="edit-client-first-work-date"
                      type="date"
                      value={draft.firstWorkDate}
                      onChange={(event) => setDraft((prev) => ({ ...prev, firstWorkDate: event.target.value }))}
                    />
                  </div>

                  {manualClient ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="edit-client-project-name">Nombre del proyecto</Label>
                        <Input
                          id="edit-client-project-name"
                          value={draft.projectName}
                          onChange={(event) => setDraft((prev) => ({ ...prev, projectName: event.target.value }))}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="edit-client-project-type">Tipo de proyecto</Label>
                        <Select value={draft.projectType} onValueChange={(value) => setDraft((prev) => ({ ...prev, projectType: value as string }))}>
                          <SelectTrigger id="edit-client-project-type" className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {projectTypeOptions.map((option) => (
                              <SelectItem key={`ficha-${option}`} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="edit-client-total-projects">Numero de proyectos con nosotros</Label>
                        <Input
                          id="edit-client-total-projects"
                          type="number"
                          min={1}
                          value={draft.totalProjectsWorked}
                          onChange={(event) => setDraft((prev) => ({ ...prev, totalProjectsWorked: Number(event.target.value) || 1 }))}
                        />
                      </div>
                    </>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Otros contactos</p>
                    <Button variant="outline" size="sm" className="h-auto px-3 py-1.5 text-xs" onClick={addDraftContact}>
                      Agregar contacto
                    </Button>
                  </div>

                  <div className="mt-2 space-y-3">
                    {draft.contacts.map((contact, index) => (
                      <div key={`draft-contact-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-1">
                            <Label htmlFor={`draft-contact-${index}-name`} className="text-xs text-slate-600">Nombre</Label>
                            <Input
                              id={`draft-contact-${index}-name`}
                              value={contact.name}
                              onChange={(event) => updateDraftContact(index, { name: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`draft-contact-${index}-role`} className="text-xs text-slate-600">Rol</Label>
                            <Input
                              id={`draft-contact-${index}-role`}
                              value={contact.role}
                              onChange={(event) => updateDraftContact(index, { role: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`draft-contact-${index}-phone`} className="text-xs text-slate-600">Contacto</Label>
                            <Input
                              id={`draft-contact-${index}-phone`}
                              value={contact.phone}
                              onChange={(event) => updateDraftContact(index, { phone: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`draft-contact-${index}-email`} className="text-xs text-slate-600">Correo electronico</Label>
                            <Input
                              id={`draft-contact-${index}-email`}
                              value={contact.email}
                              onChange={(event) => updateDraftContact(index, { email: event.target.value })}
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto px-2 py-1 text-xs"
                            onClick={() => removeDraftContact(index)}
                          >
                            Quitar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {editorError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {editorError}
                  </div>
                ) : null}
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={closeEditor}>
                Cancelar
              </Button>
              <Button onClick={saveClient}>
                Guardar cambios
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </section>
    </main>
  );
}
