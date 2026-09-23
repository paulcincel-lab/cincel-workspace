"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Input } from "@/components/ui/shadcn/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import {
  canCreateResourceInSection,
  canDeleteResourceInSection,
  canEditResourceInSection,
  canViewResourceSection,
  resolveResourcesCapabilities,
} from "@/lib/auth/permissions";
import {
  createResourceLinkAction,
  deleteResourceLinkAction,
  fetchResourceLinksAction,
  updateResourceLinkAction,
} from "@/lib/actions/resources-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import {
  canPreviewInline,
  driveContentUrl,
  getDriveId,
  getDrivePreviewUrl,
  hasDriveUrl,
  inferLinkTypeFromUrl,
} from "@/lib/google/drive-url";
import DriveBrowser, { type DriveBrowserEntry } from "@/components/recursos/DriveBrowser";
import DrivePickerDialog, { type DrivePickerEntry } from "@/components/recursos/DrivePickerDialog";
import { useGoogleConnectResult } from "@/lib/google/use-google-connect-result";
import type { DriveFileMeta, Staff } from "@/lib/types/core";
import type {
  ResourceAppliesTo,
  ResourceLink,
  ResourceLinkType,
  ResourceSection,
  ResourceStatus,
  ResourceSubsection,
} from "@/lib/types/resource";

const RECENT_DOCS_STORAGE_KEY = "cincel.resources.recent-docs.v1";

const SECTION_ORDER: ResourceSection[] = [
  "mis-documentos",
  "mis-favoritos",
  "plantillas-diseno",
  "formatos-obra",
  "mis-vacaciones",
  "formacion",
  "empresa",
];

const PRIMARY_SECTION_ORDER: ResourceSection[] = [
  "mis-documentos",
  "mis-favoritos",
  "plantillas-diseno",
  "formatos-obra",
  "mis-vacaciones",
  "formacion",
];

const EMPRESA_SECTION_NAV = [
  { label: "Book", path: "/recursos/empresa/book" },
  { label: "Manual de la empresa", path: "/recursos/empresa/manual-de-la-empresa" },
  { label: "Imagen de la empresa", path: "/recursos/empresa/imagen-de-la-empresa" },
  { label: "RFC", path: "/recursos/empresa/rfc" },
  { label: "Politicas de la empresa", path: "/recursos/empresa/politicas-de-la-empresa" },
] as const;

const SECTION_LABEL: Record<ResourceSection, string> = {
  "mis-documentos": "Mis documentos",
  "mis-favoritos": "Mis Favoritos",
  "plantillas-diseno": "Plantillas de diseño",
  "formatos-obra": "Formatos de Obra",
  "mis-vacaciones": "Mis Vacaciones",
  formacion: "Formación",
  empresa: "Empresa",
};

const SECTION_DESCRIPTION: Record<ResourceSection, string> = {
  "mis-documentos": "Documentos personales del integrante seleccionado.",
  "mis-favoritos": "Documentos marcados como favoritos para consulta rápida.",
  "plantillas-diseno": "Plantillas y formatos de diseño.",
  "formatos-obra": "Formatos operativos para obra.",
  "mis-vacaciones": "Formato y documentos de vacaciones.",
  formacion: "Material de apoyo, aprendizaje y referencia.",
  empresa: "Documentos internos e institucionales.",
};

const SECTION_PATH: Record<ResourceSection, string> = {
  "mis-documentos": "/recursos/mis-documentos",
  "mis-favoritos": "/recursos/mis-favoritos",
  "plantillas-diseno": "/recursos/plantillas-diseno",
  "formatos-obra": "/recursos/formatos-obra",
  "mis-vacaciones": "/recursos/mis-vacaciones",
  formacion: "/recursos/formacion",
  empresa: "/recursos/empresa",
};

const SECTION_NAV: Array<{ section: ResourceSection; label: string; path: string }> = PRIMARY_SECTION_ORDER.map((section) => ({
  section,
  label: SECTION_LABEL[section],
  path: SECTION_PATH[section],
}));

type WorkspaceMode = "overview" | ResourceSection;

type CreateDraft = {
  title: string;
  url: string;
  section: ResourceSection;
  subsection: ResourceSubsection;
  linkType: ResourceLinkType;
  appliesTo: ResourceAppliesTo;
  ownerId: string | null;
  personalForId: string | null;
  status: ResourceStatus;
  drive: Omit<DriveFileMeta, "id"> | null;
};

type RecentDocument = {
  id: string;
  title: string;
  url: string;
  href?: string;
  openedAt: string;
  section: ResourceSection;
};

type RemoveDraft = {
  scope: ResourceSection;
  selectedId: string;
};

const EMPTY_CREATE_DRAFT: CreateDraft = {
  title: "",
  url: "",
  section: "mis-documentos",
  subsection: null,
  linkType: "drive_file",
  appliesTo: "general",
  ownerId: null,
  personalForId: null,
  status: "vigente",
  drive: null,
};

function loadRecentDocuments(): RecentDocument[] {
  const stored = readStorage(RECENT_DOCS_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as RecentDocument[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        ...item,
        url: item.url ?? item.href,
      }))
      .filter((item) => hasDriveUrl(item.url))
      .slice(0, 8);
  } catch {
    removeStorage(RECENT_DOCS_STORAGE_KEY);
    return [];
  }
}

function saveRecentDocuments(next: RecentDocument[]): void {
  writeStorage(RECENT_DOCS_STORAGE_KEY, JSON.stringify(next.slice(0, 8)));
}

function FolderGlyph({ accent = "bg-foreground/70" }: { accent?: string }) {
  return (
    <div className="relative mx-auto h-28 w-36">
      <div className={`absolute left-0 top-0 h-7 w-16 rounded-tl-md rounded-tr-md ${accent}`} />
      <div className={`absolute left-0 top-5 h-20 w-36 rounded-lg ${accent} opacity-80`} />
      <div className="absolute left-1 top-6 h-20 w-[138px] rounded-md bg-background/20" />
    </div>
  );
}

function FolderTile({
  label,
  count,
  subtitle,
  accent,
  href,
}: {
  label: string;
  count: number;
  subtitle: string;
  accent: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-start rounded-3xl px-3 py-4 text-center transition hover:-translate-y-0.5 hover:bg-accent"
    >
      <FolderGlyph accent={accent} />
      <p className="mt-4 text-base font-medium text-muted-foreground group-hover:text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <span className="mt-2 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
        {count} carpeta{count === 1 ? "" : "s"}
      </span>
    </Link>
  );
}

function ShowcaseCard({
  title,
  count,
  caption,
  accent,
  note,
}: {
  title: string;
  count: string;
  caption: string;
  accent: string;
  note: string;
}) {
  return (
    <article className="rounded-3xl border border-border bg-card p-6 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
      <h3 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h3>

      <div className="mt-5 flex items-end gap-3">
        <div className={`h-12 w-12 rounded-full ${accent}`} />
        <div className={`h-14 w-14 rounded-full ${accent} opacity-70`} />
        <div className={`h-10 w-10 rounded-full ${accent} opacity-40`} />
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-4xl font-bold text-foreground">{count}</p>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{caption}</p>
        <p className="mt-4 text-sm italic text-muted-foreground">{note}</p>
      </div>
    </article>
  );
}

function SectionPills({ mode, activeLabel }: { mode: WorkspaceMode; activeLabel: string }) {
  if (mode === "empresa") {
    return (
      <div className="flex flex-wrap gap-2">
        {EMPRESA_SECTION_NAV.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeLabel === item.label ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PRIMARY_SECTION_ORDER.map((section) => (
        <Link
          key={section}
          href={SECTION_PATH[section]}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === section ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"}`}
        >
          {SECTION_LABEL[section]}
        </Link>
      ))}
    </div>
  );
}

export default function ResourcesWorkspace({
  mode,
  titleOverride,
  descriptionOverride,
  initialLinks,
  driveEnabled = false,
}: {
  mode: WorkspaceMode;
  titleOverride?: string;
  descriptionOverride?: string;
  initialLinks?: ResourceLink[];
  driveEnabled?: boolean;
}) {
  const googleConnectResult = useGoogleConnectResult();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [resourceLinks, setResourceLinks] = useState<ResourceLink[]>(() => initialLinks ?? []);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>(() => loadRecentDocuments());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [search, setSearch] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateDraft | null>(null);
  // Set while the create sheet is editing an existing resource instead.
  const [editingId, setEditingId] = useState<string | null>(null);
  // A file opened from the overview's Drive browser, previewed in a sheet.
  const [drivePreview, setDrivePreview] = useState<DriveBrowserEntry | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const applyDrivePick = (entry: DrivePickerEntry) => {
    setShowDrivePicker(false);
    setCreating((current) =>
      current
        ? {
            ...current,
            url: entry.webViewLink,
            title: current.title.trim() || entry.name,
            linkType: entry.isFolder ? "drive_folder" : "drive_file",
            drive: {
              googleFileId: entry.id,
              fileName: entry.name,
              mimeType: entry.mimeType,
              iconLink: entry.iconLink,
              thumbnailLink: entry.thumbnailLink,
              webViewLink: entry.webViewLink,
              syncedAt: new Date().toISOString(),
            },
          }
        : current
    );
  };
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [removeDraft, setRemoveDraft] = useState<RemoveDraft | null>(null);
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

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

  useEffect(() => {
    void fetchStaffAction().then(setStaff);
  }, []);

  useEffect(() => {
    void fetchResourceLinksAction()
      .then(setResourceLinks)
      .catch(() => {
        // Not authorized / no session — keep whatever the server render gave us.
      });
  }, []);

  const activeStaff = useMemo(() => staff.filter((member) => member.active), [staff]);

  const effectiveSelectedStaffId = useMemo(() => {
    if (selectedStaffId && activeStaff.some((member) => member.id === selectedStaffId)) {
      return selectedStaffId;
    }

    return activeStaff[0]?.id ?? null;
  }, [activeStaff, selectedStaffId]);

  const createResource = async (draft: CreateDraft): Promise<void> => {
    setCreateError(null);
    try {
      const created = await createResourceLinkAction({
        title: draft.title.trim(),
        url: draft.url.trim(),
        section: draft.section,
        subsection: draft.subsection,
        linkType: draft.linkType,
        appliesTo: draft.appliesTo,
        status: draft.status,
        ownerId: draft.ownerId,
        personalForId: draft.personalForId,
        drive: draft.drive,
      });
      setResourceLinks((current) => [...current, created]);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear el recurso.");
      throw err;
    }
  };

  const deleteResource = async (id: string): Promise<void> => {
    try {
      await deleteResourceLinkAction(id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo quitar el recurso.");
      return;
    }

    setResourceLinks((current) => current.filter((link) => link.id !== id));

    setRecentDocuments((current) => {
      const cleaned = current.filter((item) => item.id !== id);
      saveRecentDocuments(cleaned);
      return cleaned;
    });

    if (selectedDocumentId === id) {
      setSelectedDocumentId(null);
    }
  };

  const filteredLinks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return resourceLinks
      .filter((link) => hasDriveUrl(link.url))
      .filter((link) => {
        // Personal links (e.g. someone's "Mis Documentos" folder) are only
        // visible to the staff member currently selected in the picker.
        // Links with no personalFor are shared/general and always show.
        if (!link.personalFor) return true;
        return link.personalFor.id === effectiveSelectedStaffId;
      })
      .filter((link) => {
        if (mode !== "overview" && link.section !== mode) {
          return false;
        }

        if (!query) return true;

        const owner = link.owner?.name ?? "";

        return (
          link.title.toLowerCase().includes(query)
          || SECTION_LABEL[link.section].toLowerCase().includes(query)
          || owner.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const sectionOrder = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
        if (sectionOrder !== 0) return sectionOrder;

        if (a.subsection !== b.subsection) {
          if (a.subsection === null) return -1;
          if (b.subsection === null) return 1;
          return a.subsection.localeCompare(b.subsection);
        }

        return a.title.localeCompare(b.title);
      });
  }, [resourceLinks, search, effectiveSelectedStaffId, mode]);

  const grouped = useMemo(() => {
    const result: Record<ResourceSection, Record<string, ResourceLink[]>> = {
      "mis-documentos": { general: [] },
      "mis-favoritos": { general: [] },
      "plantillas-diseno": { general: [] },
      "formatos-obra": { general: [] },
      "mis-vacaciones": { general: [] },
      formacion: { general: [] },
      empresa: { general: [] },
    };

    filteredLinks.forEach((link) => {
      const key = link.subsection ?? "general";
      if (!result[link.section][key]) {
        result[link.section][key] = [];
      }
      result[link.section][key].push(link);
    });

    return result;
  }, [filteredLinks]);

  const openEditor = (link: ResourceLink) => {
    if (
      !canEditResourceInSection({
        capabilities: resourcesCapabilities,
        section: link.section,
        viewerId: authenticatedUser?.member.id ?? null,
        ownerId: link.owner?.id ?? null,
        personalForId: link.personalFor?.id ?? null,
      })
    ) {
      return;
    }
    setCreateError(null);
    setEditingId(link.id);
    setCreating({
      title: link.title,
      url: link.url,
      section: link.section,
      subsection: link.subsection,
      linkType: link.linkType,
      appliesTo: link.appliesTo,
      ownerId: link.owner?.id ?? null,
      personalForId: link.personalFor?.id ?? null,
      status: link.status,
      drive: null,
    });
  };

  const closeCreator = () => {
    setCreating(null);
    setEditingId(null);
    setCreateError(null);
  };

  const saveEdit = async (id: string, draft: CreateDraft) => {
    setCreateError(null);
    try {
      const updated = await updateResourceLinkAction(id, {
        title: draft.title.trim(),
        url: draft.url.trim(),
        section: draft.section,
        linkType: inferLinkTypeFromUrl(draft.url, draft.linkType),
        drive: draft.drive ?? undefined,
      });
      setResourceLinks((current) => current.map((link) => (link.id === updated.id ? updated : link)));
      closeCreator();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo editar el recurso.");
    }
  };

  const openCreator = (seed: Partial<CreateDraft>) => {
    const targetSection = seed.section ?? (mode === "overview" ? "empresa" : mode);

    if (!canCreateResourceInSection({ capabilities: resourcesCapabilities, section: targetSection })) {
      return;
    }

    setCreateError(null);
    setCreating({
      ...EMPTY_CREATE_DRAFT,
      ownerId: effectiveSelectedStaffId,
      ...seed,
    });
  };

  const saveCreate = () => {
    if (!creating) return;
    if (!creating.title.trim() || !creating.url.trim()) return;
    if (editingId) {
      void saveEdit(editingId, creating);
      return;
    }
    if (!canCreateResourceInSection({ capabilities: resourcesCapabilities, section: creating.section })) return;

    void createResource({
      ...creating,
      linkType: inferLinkTypeFromUrl(creating.url, creating.linkType),
    }).then(
      () => setCreating(null),
      () => {
        // Error already surfaced via createError — keep the sheet open so the
        // user can adjust the input and retry.
      }
    );
  };

  const pageMode = mode === "overview" ? null : mode;
  const pageLabel = titleOverride ?? (pageMode ? SECTION_LABEL[pageMode] : "Recursos");
  const pageDescription = descriptionOverride ?? (pageMode ? SECTION_DESCRIPTION[pageMode] : "Acceso rápido a las áreas de recursos del despacho.");
  const resourcesCapabilities = resolveResourcesCapabilities(authenticatedUser);
  const canViewCurrentSection = pageMode
    ? canViewResourceSection({
      capabilities: resourcesCapabilities,
      section: pageMode,
    })
    : resourcesCapabilities.canViewResources;
  const createActionSection: ResourceSection = mode === "overview" ? "empresa" : mode;
  const canCreateInCurrentSection = canCreateResourceInSection({
    capabilities: resourcesCapabilities,
    section: createActionSection,
  });
  const canDeleteInCurrentSection = pageMode
    ? canDeleteResourceInSection({
      capabilities: resourcesCapabilities,
      section: pageMode,
    })
    : false;

  const totalResources = filteredLinks.length;
  const folderCount = filteredLinks.filter((link) => link.linkType === "drive_folder").length;
  const fileCount = filteredLinks.filter((link) => link.linkType === "drive_file").length;
  const webCount = filteredLinks.filter((link) => link.linkType === "web").length;

  const folderTiles = PRIMARY_SECTION_ORDER.map((section) => ({
    label: SECTION_LABEL[section],
    count: mode === "overview" ? grouped[section].general.length : (section === pageMode ? totalResources : 0),
    subtitle: SECTION_DESCRIPTION[section],
    accent: "bg-foreground/70",
    href: SECTION_PATH[section],
  }));

  const spotlightCards = [
    {
      title: "Carpetas visibles",
      count: String(folderCount).padStart(2, "0"),
      caption: "Explorador Drive",
      accent: "bg-foreground/10",
      note: "Estructura visual compacta para navegar carpetas como en Drive.",
    },
    {
      title: "Recursos activos",
      count: String(totalResources),
      caption: "Enlaces filtrados",
      accent: "bg-foreground/15",
      note: "Vista limpia para identificar carpetas, archivos y accesos web.",
    },
    {
      title: "Contenido útil",
      count: String(fileCount + webCount),
      caption: "Material abierto",
      accent: "bg-foreground/20",
      note: "Tarjetas grandes con jerarquía, separadores y estado visual.",
    },
  ];

  const sectionTitle = pageLabel;
  const sectionDescription = pageDescription;

  const recentDocumentsToShow = recentDocuments.length > 0
    ? recentDocuments
    : filteredLinks
        .filter((link) => link.linkType === "drive_file")
        .slice(0, 4)
        .map((link) => ({
          id: link.id,
          title: link.title,
          url: link.url,
          openedAt: link.updatedAt,
          section: link.section,
        }));

  const pageDocuments = pageMode ? grouped[pageMode].general : [];
  const selectedPageDocument = pageDocuments.find((link) => link.id === selectedDocumentId) ?? null;
  const fallbackPageDocument = pageDocuments.find((link) => getDrivePreviewUrl(link.url, link.linkType)) ?? pageDocuments[0] ?? null;
  const pagePreviewSource = selectedPageDocument ?? fallbackPageDocument;
  const pagePreviewUrl = pagePreviewSource ? getDrivePreviewUrl(pagePreviewSource.url, pagePreviewSource.linkType) : null;
  // With Drive configured, preview Drive links through the app as the caller's
  // connected Google account (#433) instead of iframing drive.google.com,
  // which only works if the browser is signed into the right account.
  const pageDriveFileId =
    driveEnabled && pagePreviewSource && pagePreviewSource.linkType !== "web"
      ? (pagePreviewSource.drive?.googleFileId ?? getDriveId(pagePreviewSource.url))
      : null;
  const canEditPagePreview = pagePreviewSource
    ? canEditResourceInSection({
        capabilities: resourcesCapabilities,
        section: pagePreviewSource.section,
        viewerId: authenticatedUser?.member.id ?? null,
        ownerId: pagePreviewSource.owner?.id ?? null,
        personalForId: pagePreviewSource.personalFor?.id ?? null,
      })
    : false;
  const pagePreviewUnavailableReason = !pagePreviewSource
    ? `No hay recursos en ${pageLabel.toLowerCase()}.`
    : pagePreviewUrl
      ? null
      : pagePreviewSource.linkType === "web"
        ? "El enlace seleccionado es tipo web y no admite vista previa embebida."
        : "No se pudo generar vista previa. Verifica que sea un enlace valido y compartido de Google Drive o Google Docs.";

  const openPageCreator = () => {
    openCreator({
      title: pageMode === "mis-documentos" ? "Mis Documentos" : pageLabel,
      section: pageMode as ResourceSection,
      subsection: null,
      linkType: pageMode === "mis-favoritos" ? "web" : pageMode === "mis-documentos" ? "drive_folder" : pageMode === "mis-vacaciones" ? "drive_file" : pageMode === "empresa" ? "drive_file" : "drive_file",
      appliesTo: "general",
      ownerId: pageMode === "mis-documentos" ? effectiveSelectedStaffId : null,
      personalForId: pageMode === "mis-documentos" ? effectiveSelectedStaffId : null,
    });
  };

  const removePageResource = () => {
    if (pageDocuments.length === 0) return;
    if (!pageMode) return;
    if (!canDeleteInCurrentSection) return;

    setRemoveDraft({
      scope: pageMode as ResourceSection,
      selectedId: pagePreviewSource?.id ?? pageDocuments[0].id,
    });
  };

  const confirmRemoveDraft = () => {
    if (!removeDraft) return;
    if (!canDeleteResourceInSection({ capabilities: resourcesCapabilities, section: removeDraft.scope })) return;
    void deleteResource(removeDraft.selectedId);
    setRemoveDraft(null);
  };

  if (!isMounted) {
    return (
      <main className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-6 lg:p-10">
          <Header />
        </section>
      </main>
    );
  }

  if (!canViewCurrentSection) {
    return (
      <main className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-6 lg:p-10">
          <Header />
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-foreground">Sin acceso al modulo Empresa</h1>
            <p className="mt-2 text-sm text-muted-foreground">Tu acceso actual no permite visualizar la biblioteca institucional.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/80">
              Volver al dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-6 lg:p-10">
        <Header />

        <div className="space-y-6">
          {googleConnectResult ? (
            <p className={`text-sm ${googleConnectResult.success ? "text-muted-foreground" : "text-destructive"}`}>
              {googleConnectResult.message}
            </p>
          ) : null}
          <section className="rounded-[32px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Repositorio de Recursos</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">{sectionTitle}</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{sectionDescription}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar carpeta o recurso"
                  className="w-full sm:w-72"
                />

                <Select
                  items={Object.fromEntries(activeStaff.map((m) => [m.id, m.name]))}
                  value={effectiveSelectedStaffId ?? ""}
                  onValueChange={(value) => setSelectedStaffId(value as string)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeStaff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  disabled={!canCreateInCurrentSection}
                  onClick={() => openCreator({
                    title: "Nuevo recurso",
                    section: mode === "overview" ? "empresa" : mode,
                    subsection: null,
                    linkType: mode === "mis-favoritos" ? "web" : mode === "mis-documentos" ? "drive_folder" : mode === "formacion" ? "drive_folder" : "drive_file",
                    appliesTo: "general",
                  })}
                  title={canCreateInCurrentSection ? "" : "No tienes permiso para agregar recursos en esta sección"}
                >
                  + Nuevo acceso
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
            {mode === "overview" ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Google Drive</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Carpetas principales</h2>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    {folderTiles.length} carpetas visibles
                  </span>
                </div>

                <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
                  {folderTiles.map((folder) => (
                    <FolderTile
                      key={folder.label}
                      label={folder.label}
                      count={folder.count}
                      subtitle={folder.subtitle}
                      accent={folder.accent}
                      href={folder.href}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sección activa</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{sectionTitle}</h2>
                  </div>
                  <SectionPills mode={mode} activeLabel={pageLabel} />
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recursos</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{totalResources}</p>
                  </div>
                  <div className="rounded-3xl bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Carpetas</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{folderCount}</p>
                  </div>
                  <div className="rounded-3xl bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Archivos</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{fileCount}</p>
                  </div>
                  <div className="rounded-3xl bg-muted p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Web</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{webCount}</p>
                  </div>
                </div>
              </>
            )}
          </section>

          {mode === "overview" && driveEnabled ? (
            <section className="rounded-[32px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Google Drive</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Explorar Drive</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Navega tu Drive con la cuenta de Google conectada. Haz clic en un archivo para verlo.
              </p>
              <div className="mt-6 flex h-[480px] flex-col overflow-hidden rounded-2xl border border-border">
                <DriveBrowser active selectedId={drivePreview?.id ?? null} onFileClick={setDrivePreview} />
              </div>
            </section>
          ) : null}

          {mode === "overview" ? (
            <section className="grid gap-6 xl:grid-cols-3">
              {spotlightCards.map((card) => (
                <ShowcaseCard key={card.title} {...card} />
              ))}
            </section>
          ) : null}

          {mode === "overview" ? (
            <section className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2 rounded-[32px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Navegación</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Abrir una sección</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">Elige una carpeta para entrar a su vista propia.</p>
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {SECTION_NAV.map((item) => (
                    <FolderTile
                      key={item.section}
                      label={item.label}
                      count={grouped[item.section].general.length}
                      subtitle={SECTION_DESCRIPTION[item.section]}
                      accent="bg-foreground/70"
                      href={item.path}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">Abrir documentos Recientes</h3>
                <p className="mt-2 text-sm text-muted-foreground">Documentos de Google abiertos recientemente en Recursos.</p>

                <div className="mt-6 space-y-4">
                  {recentDocumentsToShow.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted p-4 text-sm text-muted-foreground">
                      Abre un documento de Google para verlo aquí.
                    </div>
                  ) : recentDocumentsToShow.map((link) => (
                    <Button
                      key={link.id}
                      variant="outline"
                      className="h-auto w-full justify-start bg-muted p-4 text-left font-normal hover:bg-card"
                      onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card shadow-sm">
                          <span className="text-lg text-muted-foreground">▣</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{link.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{SECTION_LABEL[link.section]}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Abrir documento</p>
                          <div className="mt-3 h-1.5 rounded-full bg-border">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: "78%" }} />
                          </div>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {mode !== "overview" ? (
            <section className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2 rounded-[32px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{pageLabel}</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{pageLabel}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Selecciona un documento con URL para ver su vista previa aquí.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pagePreviewSource && !pagePreviewUrl ? (
                      <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                        Sin preview
                      </span>
                    ) : null}
                    <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      {pageDocuments.length} documentos
                    </span>
                    {pageDocuments.length > 0 ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto rounded-full border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20"
                          onClick={removePageResource}
                          disabled={!canDeleteInCurrentSection}
                          title={canDeleteInCurrentSection ? "" : "No tienes permiso para eliminar recursos en esta sección"}
                        >
                          Quitar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto rounded-full px-3 py-1.5 text-xs"
                          disabled={!canEditPagePreview}
                          onClick={() => pagePreviewSource && openEditor(pagePreviewSource)}
                          title={canEditPagePreview ? `Editar ${pagePreviewSource?.title ?? ""}` : "No tienes permiso para editar este recurso"}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto rounded-full px-3 py-1.5 text-xs"
                          disabled={!canCreateInCurrentSection}
                          onClick={openPageCreator}
                          title={canCreateInCurrentSection ? "" : "No tienes permiso para agregar recursos en esta sección"}
                        >
                          Agregar
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto rounded-full px-3 py-1.5 text-xs"
                        disabled={!canCreateInCurrentSection}
                        onClick={openPageCreator}
                        title={canCreateInCurrentSection ? "" : "No tienes permiso para agregar recursos en esta sección"}
                      >
                        Agregar
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-border bg-muted p-3">
                  {pageDocuments.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">No hay recursos en esta página con URL. Abre Agregar y guarda un enlace para mostrarlo aquí.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {pageDocuments.map((link) => {
                        const isActive = pagePreviewSource?.id === link.id;

                        return (
                          <Button
                            key={link.id}
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            className="h-auto rounded-full px-3 py-1.5 text-xs"
                            onClick={() => setSelectedDocumentId(link.id)}
                          >
                            {link.title}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-6 overflow-hidden rounded-[28px] border border-border bg-muted">
                  {pageDriveFileId && pagePreviewSource?.linkType === "drive_folder" ? (
                    <div className="flex h-[620px] flex-col bg-card">
                      <DriveBrowser active rootFolderId={pageDriveFileId} onFileClick={setDrivePreview} />
                    </div>
                  ) : pageDriveFileId ? (
                    canPreviewInline(pagePreviewSource?.drive?.mimeType) ? (
                      <iframe
                        title={pagePreviewSource?.title ?? pageLabel}
                        src={driveContentUrl(pageDriveFileId)}
                        className="h-[620px] w-full"
                      />
                    ) : (
                      <div className="flex h-[620px] flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
                        <p>Este tipo de archivo no tiene vista previa en la app.</p>
                        <a href={driveContentUrl(pageDriveFileId)} className="font-medium text-foreground underline">
                          Descargar
                        </a>
                      </div>
                    )
                  ) : pagePreviewUrl ? (
                    <iframe
                      title={pagePreviewSource?.title ?? pageLabel}
                      src={pagePreviewUrl}
                      className="h-[620px] w-full"
                    />
                  ) : (
                    <div className="flex h-[620px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
                      {pagePreviewUnavailableReason}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[32px] border border-border bg-card p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">Documentos Recientes</h3>
                <p className="mt-2 text-sm text-muted-foreground">Documentos vistos últimamente. Haz clic para abrirlos de nuevo.</p>

                <div className="mt-6 space-y-4">
                  {recentDocumentsToShow.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted p-4 text-sm text-muted-foreground">
                      Aún no has abierto documentos recientes.
                    </div>
                  ) : recentDocumentsToShow.map((link) => (
                    <Button
                      key={link.id}
                      variant="outline"
                      className="h-auto w-full justify-start bg-muted p-4 text-left font-normal hover:bg-card"
                      onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card shadow-sm">
                          <span className="text-lg text-muted-foreground">▣</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{link.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{SECTION_LABEL[link.section]}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Abrir documento</p>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      <Sheet open={creating !== null} onOpenChange={(next) => { if (!next) closeCreator(); }}>
        <SheetContent className="gap-6 overflow-y-auto p-6">
          <SheetTitle>{editingId ? "Editar recurso" : "Agregar recurso"}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {editingId ? "Actualiza el título o el enlace del recurso." : "Completa la información del nuevo recurso."}
          </p>

          {creating ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Título</label>
                <Input
                  type="text"
                  value={creating.title}
                  onChange={(event) => setCreating((current) => current ? { ...current, title: event.target.value } : current)}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-muted-foreground">URL</label>
                  {driveEnabled ? (
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => setShowDrivePicker(true)}
                    >
                      Elegir de Google Drive
                    </Button>
                  ) : null}
                </div>
                <Input
                  type="text"
                  value={creating.url}
                  onChange={(event) => setCreating((current) => current ? { ...current, url: event.target.value, drive: null } : current)}
                  placeholder="https://..."
                />
                {creating.drive ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {creating.drive.iconLink ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={creating.drive.iconLink} alt="" className="h-3.5 w-3.5" />
                    ) : null}
                    Vinculado a Drive: {creating.drive.fileName}
                  </p>
                ) : null}
              </div>

              {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={closeCreator}>
              Cancelar
            </Button>
            <Button onClick={saveCreate}>
              {editingId ? "Guardar cambios" : "Crear recurso"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <DrivePickerDialog
        open={showDrivePicker}
        onClose={() => setShowDrivePicker(false)}
        onPick={applyDrivePick}
      />

      <Sheet open={drivePreview !== null} onOpenChange={(next) => { if (!next) setDrivePreview(null); }}>
        <SheetContent className="w-[90vw] max-w-5xl p-0" side="right">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <SheetTitle className="truncate">{drivePreview?.name}</SheetTitle>
            {drivePreview ? (
              <Button variant="outline" size="sm" onClick={() => window.open(drivePreview.webViewLink, "_blank", "noopener")}>
                Abrir en Drive
              </Button>
            ) : null}
          </div>
          {drivePreview ? (
            canPreviewInline(drivePreview.mimeType) ? (
              <iframe title={drivePreview.name} src={driveContentUrl(drivePreview.id)} className="h-full w-full" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
                <p>Este tipo de archivo no tiene vista previa en la app.</p>
                <a href={driveContentUrl(drivePreview.id)} className="font-medium text-foreground underline">
                  Descargar
                </a>
              </div>
            )
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={removeDraft !== null} onOpenChange={(next) => { if (!next) setRemoveDraft(null); }}>
        <SheetContent className="overflow-y-auto p-6">
          <SheetTitle>Quitar recurso</SheetTitle>
          <p className="text-sm text-muted-foreground">Selecciona el recurso que deseas quitar.</p>

          {removeDraft ? (
            <RadioGroup
              value={removeDraft.selectedId}
              onValueChange={(value) => setRemoveDraft((current) => current ? { ...current, selectedId: value as string } : current)}
              className="max-h-72 overflow-y-auto rounded-lg border border-border p-3"
            >
              {pageDocuments.map((link) => (
                <label key={link.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-accent">
                  <RadioGroupItem value={link.id} />
                  <span className="truncate text-sm text-foreground">{link.title}</span>
                </label>
              ))}
            </RadioGroup>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoveDraft(null)}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
              onClick={confirmRemoveDraft}
              disabled={!canDeleteInCurrentSection}
            >
              Quitar recurso
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
