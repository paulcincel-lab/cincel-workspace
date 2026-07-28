"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canCreateResourceInSection, canDeleteResourceInSection, canViewResourceSection, resolveResourcesCapabilities } from "@/lib/auth/permissions";
import { RESOURCE_TEMPLATES } from "@/lib/data/resources";
import { teamMembers, type TeamMember } from "@/lib/data/team";
import { getTeamMembersSnapshot } from "@/lib/repositories/team-repository";
import { fetchResourceLinks, saveResourceLinks, deleteResourceLink as deleteResourceLinkInDb } from "@/lib/repositories/resources-repository";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import { SupabaseOperationError, reportSupabaseError } from "@/lib/supabase/errors";
import type {
  ResourceAppliesTo,
  ResourceHistoryItem,
  ResourceLink,
  ResourceLinkType,
  ResourceSection,
  ResourceStatus,
  ResourceSubsection,
} from "@/lib/types/resource";

const RECENT_DOCS_STORAGE_KEY = "cincel.resources.recent-docs.v1";
const RESOURCE_ID_PATTERN = /^resource_(\d+)(?:_.+)?$/;

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
  ownerTeamMemberId: number | null;
  personalForTeamMemberId: number | null;
  status: ResourceStatus;
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
  ownerTeamMemberId: null,
  personalForTeamMemberId: null,
  status: "vigente",
};

function loadTeamMembers(): TeamMember[] {
  const snapshot = getTeamMembersSnapshot();
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot;
  }

  return teamMembers;
}

function createHistoryEntry(action: ResourceHistoryItem["action"], note: string): ResourceHistoryItem {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    action,
    note,
  };
}

function normalizeResourceLink(link: ResourceLink): ResourceLink {
  return {
    ...link,
    status: link.status === "obsoleto" ? "obsoleto" : "vigente",
    history: Array.isArray(link.history) ? link.history : [],
  };
}

function inferResourceSection(link: ResourceLink): ResourceSection {
  const legacySection = String(link.section);

  if (legacySection === "mis-documentos" || legacySection === "mis-favoritos" || legacySection === "plantillas-diseno" || legacySection === "formatos-obra" || legacySection === "mis-vacaciones" || legacySection === "formacion" || legacySection === "empresa") {
    return legacySection as ResourceSection;
  }

  if (link.templateKey.startsWith("personal_mis_documentos")) return "mis-documentos";
  if (link.templateKey.includes("vacaciones")) return "mis-vacaciones";
  if (legacySection === "personal") return "mis-documentos";
  if (legacySection === "formatos") {
    return link.subsection === "construccion" ? "formatos-obra" : "plantillas-diseno";
  }
  if (legacySection === "ventas") return "mis-favoritos";
  if (legacySection === "formacion") return "formacion";
  if (legacySection === "empresa") return "empresa";

  return "mis-documentos";
}

function buildDefaultResourceLinks(members: TeamMember[]): ResourceLink[] {
  const activeMembers = members.filter((member) => member.active);

  const globalLinks: ResourceLink[] = RESOURCE_TEMPLATES.map((template) => ({
    id: template.key,
    templateKey: template.key,
    title: template.title,
    section: template.section,
    subsection: template.subsection,
    linkType: template.linkType,
    appliesTo: template.appliesTo,
    url: "",
    status: "vigente",
    ownerTeamMemberId: null,
    personalForTeamMemberId: null,
    updatedAt: "",
    history: [],
  }));

  const personalDocs: ResourceLink[] = activeMembers.map((member) => ({
    id: `personal_mis_documentos_${member.id}`,
    templateKey: "personal_mis_documentos",
    title: "Mis Documentos",
    section: "mis-documentos",
    subsection: null,
    linkType: "drive_folder",
    appliesTo: "general",
    url: "",
    status: "vigente",
    ownerTeamMemberId: member.id,
    personalForTeamMemberId: member.id,
    updatedAt: "",
    history: [],
  }));

  return [...personalDocs, ...globalLinks];
}

function loadResourceLinks(members: TeamMember[], persisted: ResourceLink[] = []): ResourceLink[] {
  const defaults = buildDefaultResourceLinks(members);

  const mergedMap = new Map<string, ResourceLink>();
  defaults.forEach((item) => mergedMap.set(item.id, normalizeResourceLink(item)));
  persisted.forEach((item) => {
    mergedMap.set(item.id, normalizeResourceLink({ ...item, section: inferResourceSection(item) }));
  });

  return Array.from(mergedMap.values()).filter((item) => hasResourceUrl(item.url));
}

function normalizeDriveUrl(url: string): string {
  return url.trim();
}

function hasResourceUrl(url: string): boolean {
  return normalizeDriveUrl(url).length > 0;
}

function getDriveId(url: string): string | null {
  const clean = normalizeDriveUrl(url);
  if (!clean) return null;

  const docsMatch = clean.match(/docs\.google\.com\/(?:document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/);
  if (docsMatch?.[1]) return docsMatch[1];

  const folderMatch = clean.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];

  const fileMatch = clean.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return fileMatch[1];

  const queryMatch = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch?.[1]) return queryMatch[1];

  return null;
}

function getDrivePreviewUrl(url: string, linkType: ResourceLinkType): string | null {
  const clean = normalizeDriveUrl(url);
  if (!clean) return null;

  const docsPreviewMatch = clean.match(/^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
  if (docsPreviewMatch) {
    const [, docType, docId] = docsPreviewMatch;
    return `https://docs.google.com/${docType}/d/${docId}/preview`;
  }

  const driveId = getDriveId(url);

  if (!driveId) return null;

  const isFolderUrl = /\/folders\//.test(clean);

  if (linkType === "drive_folder" || isFolderUrl) {
    return `https://drive.google.com/embeddedfolderview?id=${driveId}#grid`;
  }

  return `https://drive.google.com/file/d/${driveId}/preview`;
}

function inferLinkTypeFromUrl(url: string, currentType: ResourceLinkType): ResourceLinkType {
  const clean = normalizeDriveUrl(url);
  if (!clean) return currentType;
  if (/\/folders\//.test(clean)) return "drive_folder";
  if (/docs\.google\.com\//.test(clean)) return "drive_file";
  if (/drive\.google\.com\//.test(clean)) return "drive_file";
  return "web";
}

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
      .filter((item) => hasResourceUrl(item.url))
      .slice(0, 8);
  } catch {
    removeStorage(RECENT_DOCS_STORAGE_KEY);
    return [];
  }
}

function saveRecentDocuments(next: RecentDocument[]): void {
  writeStorage(RECENT_DOCS_STORAGE_KEY, JSON.stringify(next.slice(0, 8)));
}

function buildNextResourceId(resources: ResourceLink[]): string {
  let maxId = 0;

  resources.forEach((resource) => {
    const match = RESOURCE_ID_PATTERN.exec(resource.id);
    if (!match) return;

    const numericId = Number(match[1]);
    if (Number.isFinite(numericId) && numericId > maxId) {
      maxId = numericId;
    }
  });

  return `resource_${maxId + 1}`;
}

function FolderGlyph({ accent = "bg-slate-500" }: { accent?: string }) {
  return (
    <div className="relative mx-auto h-28 w-36">
      <div className={`absolute left-0 top-0 h-7 w-16 rounded-tl-md rounded-tr-md ${accent}`} />
      <div className={`absolute left-0 top-5 h-20 w-36 rounded-lg ${accent} opacity-80`} />
      <div className="absolute left-1 top-6 h-20 w-[138px] rounded-md bg-white/12" />
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
      className="group flex flex-col items-center justify-start rounded-3xl px-3 py-4 text-center transition hover:-translate-y-0.5 hover:bg-slate-50"
    >
      <FolderGlyph accent={accent} />
      <p className="mt-4 text-base font-medium text-slate-600 group-hover:text-slate-900">{label}</p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      <span className="mt-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
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
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
      <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h3>

      <div className="mt-5 flex items-end gap-3">
        <div className={`h-12 w-12 rounded-full ${accent}`} />
        <div className={`h-14 w-14 rounded-full ${accent} opacity-70`} />
        <div className={`h-10 w-10 rounded-full ${accent} opacity-40`} />
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="text-4xl font-bold text-slate-900">{count}</p>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{caption}</p>
        <p className="mt-4 text-sm italic text-slate-600">{note}</p>
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
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeLabel === item.label ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
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
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === section ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
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
}: {
  mode: WorkspaceMode;
  titleOverride?: string;
  descriptionOverride?: string;
}) {
  const [members] = useState<TeamMember[]>(() => loadTeamMembers());
  const [resourceLinks, setResourceLinks] = useState<ResourceLink[]>(() => loadResourceLinks(loadTeamMembers()));
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>(() => loadRecentDocuments());
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [creating, setCreating] = useState<CreateDraft | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
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
    const hydrateResources = async () => {
      try {
        const remote = await fetchResourceLinks();
        setResourceLinks(loadResourceLinks(loadTeamMembers(), remote));
      } catch (err) {
        if (err instanceof SupabaseOperationError) {
          reportSupabaseError(err);
        }
      }
    };

    void hydrateResources();
  }, []);

  const activeMembers = useMemo(() => members.filter((member) => member.active), [members]);

  const effectiveSelectedMemberId = useMemo(() => {
    if (selectedMemberId && activeMembers.some((member) => member.id === selectedMemberId)) {
      return selectedMemberId;
    }

    return activeMembers[0]?.id ?? null;
  }, [activeMembers, selectedMemberId]);

  const memberById = useMemo(() => {
    const map = new Map<number, TeamMember>();
    members.forEach((member) => map.set(member.id, member));
    return map;
  }, [members]);

  const persistLinks = (next: ResourceLink[]) => {
    setResourceLinks(next);
    saveResourceLinks(next).catch((err: unknown) => {
      if (err instanceof SupabaseOperationError) {
        reportSupabaseError(err);
      }
    });
  };

  const deleteResource = (id: string) => {
    const next = resourceLinks.filter((link) => link.id !== id);
    persistLinks(next);
    deleteResourceLinkInDb(id).catch((err: unknown) => {
      if (err instanceof SupabaseOperationError) {
        reportSupabaseError(err);
      }
    });

    setRecentDocuments((current) => {
      const cleaned = current.filter((item) => item.id !== id);
      saveRecentDocuments(cleaned);
      return cleaned;
    });

    if (selectedDocumentId === id) {
      setSelectedDocumentId(null);
    }
  };

  const createResource = (draft: CreateDraft): ResourceLink => {
    const now = new Date().toISOString();

    const newItem: ResourceLink = {
      id: buildNextResourceId(resourceLinks),
      templateKey: draft.personalForTeamMemberId ? "personal_mis_documentos_custom" : "custom",
      title: draft.title.trim(),
      section: draft.section,
      subsection: draft.subsection,
      linkType: draft.linkType,
      appliesTo: draft.appliesTo,
      url: draft.url.trim(),
      status: draft.status,
      ownerTeamMemberId: draft.ownerTeamMemberId,
      personalForTeamMemberId: draft.personalForTeamMemberId,
      updatedAt: now,
      history: [createHistoryEntry("created", "Recurso creado")],
    };

    persistLinks([...resourceLinks, newItem]);
    return newItem;
  };

  const filteredLinks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return resourceLinks
      .filter((link) => hasResourceUrl(link.url))
      .filter((link) => {
        if (link.templateKey.startsWith("personal_mis_documentos")) {
          return link.personalForTeamMemberId === effectiveSelectedMemberId;
        }

        return true;
      })
      .filter((link) => {
        if (mode !== "overview" && link.section !== mode) {
          return false;
        }

        if (!query) return true;

        const owner = link.ownerTeamMemberId ? memberById.get(link.ownerTeamMemberId)?.name ?? "" : "";

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
  }, [resourceLinks, search, effectiveSelectedMemberId, memberById, mode]);

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

  const openCreator = (seed: Partial<CreateDraft>) => {
    const targetSection = seed.section ?? (mode === "overview" ? "empresa" : mode);

    if (!canCreateResourceInSection({ capabilities: resourcesCapabilities, section: targetSection })) {
      return;
    }

    setCreating({
      ...EMPTY_CREATE_DRAFT,
      ownerTeamMemberId: effectiveSelectedMemberId,
      ...seed,
    });
  };

  const saveCreate = () => {
    if (!creating) return;
    if (!creating.title.trim() || !creating.url.trim()) return;
    if (!canCreateResourceInSection({ capabilities: resourcesCapabilities, section: creating.section })) return;

    createResource({
      ...creating,
      linkType: inferLinkTypeFromUrl(creating.url, creating.linkType),
    });
    setCreating(null);
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
    accent: "bg-slate-500",
    href: SECTION_PATH[section],
  }));

  const spotlightCards = [
    {
      title: "Carpetas visibles",
      count: String(folderCount).padStart(2, "0"),
      caption: "Explorador Drive",
      accent: "bg-orange-100",
      note: "Estructura visual compacta para navegar carpetas como en Drive.",
    },
    {
      title: "Recursos activos",
      count: String(totalResources),
      caption: "Enlaces filtrados",
      accent: "bg-blue-100",
      note: "Vista limpia para identificar carpetas, archivos y accesos web.",
    },
    {
      title: "Contenido útil",
      count: String(fileCount + webCount),
      caption: "Material abierto",
      accent: "bg-emerald-100",
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
      ownerTeamMemberId: pageMode === "mis-documentos" ? effectiveSelectedMemberId : null,
      personalForTeamMemberId: pageMode === "mis-documentos" ? effectiveSelectedMemberId : null,
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
    deleteResource(removeDraft.selectedId);
    setRemoveDraft(null);
  };

  if (!isMounted) {
    return (
      <main className="flex min-h-screen bg-[#f3f4f6]">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-6 lg:p-10">
          <Header />
        </section>
      </main>
    );
  }

  if (!canViewCurrentSection) {
    return (
      <main className="flex min-h-screen bg-[#f3f4f6]">
        <Sidebar />
        <section className="flex-1 overflow-y-auto p-6 lg:p-10">
          <Header />
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Sin acceso al modulo Empresa</h1>
            <p className="mt-2 text-sm text-slate-600">Tu acceso actual no permite visualizar la biblioteca institucional.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Volver al dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[#f3f4f6]">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-6 lg:p-10">
        <Header />

        <div className="space-y-6">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Repositorio de Recursos</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 lg:text-4xl">{sectionTitle}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">{sectionDescription}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar carpeta o recurso"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none ring-0 transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 sm:w-72"
                />

                <select
                  value={effectiveSelectedMemberId ?? ""}
                  onChange={(event) => setSelectedMemberId(Number(event.target.value))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                >
                  {activeMembers.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!canCreateInCurrentSection}
                  onClick={() => openCreator({
                    title: "Nuevo recurso",
                    section: mode === "overview" ? "empresa" : mode,
                    subsection: null,
                    linkType: mode === "mis-favoritos" ? "web" : mode === "mis-documentos" ? "drive_folder" : mode === "formacion" ? "drive_folder" : "drive_file",
                    appliesTo: "general",
                  })}
                  title={canCreateInCurrentSection ? "" : "No tienes permiso para agregar recursos en esta sección"}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm ${canCreateInCurrentSection ? "bg-slate-900 text-white hover:bg-slate-800" : "cursor-not-allowed bg-slate-300 text-slate-100"}`}
                >
                  + Nuevo acceso
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
            {mode === "overview" ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Google Drive</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Carpetas principales</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                    5 carpetas visibles
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
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sección activa</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{sectionTitle}</h2>
                  </div>
                  <SectionPills mode={mode} activeLabel={pageLabel} />
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Recursos</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{totalResources}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Carpetas</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{folderCount}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Archivos</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{fileCount}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Web</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{webCount}</p>
                  </div>
                </div>
              </>
            )}
          </section>

          {mode === "overview" ? (
            <section className="grid gap-6 xl:grid-cols-3">
              {spotlightCards.map((card) => (
                <ShowcaseCard key={card.title} {...card} />
              ))}
            </section>
          ) : null}

          {mode === "overview" ? (
            <section className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Navegación</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Abrir una sección</h2>
                  </div>
                  <p className="text-sm text-slate-500">Elige una carpeta para entrar a su vista propia.</p>
                </div>

                <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {SECTION_NAV.map((item) => (
                    <FolderTile
                      key={item.section}
                      label={item.label}
                      count={grouped[item.section].general.length}
                      subtitle={SECTION_DESCRIPTION[item.section]}
                      accent="bg-slate-500"
                      href={item.path}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Abrir documentos Recientes</h3>
                <p className="mt-2 text-sm text-slate-500">Documentos de Google abiertos recientemente en Recursos.</p>

                <div className="mt-6 space-y-4">
                  {recentDocumentsToShow.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      Abre un documento de Google para verlo aquí.
                    </div>
                  ) : recentDocumentsToShow.map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
                          <span className="text-lg text-slate-500">▣</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{link.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{SECTION_LABEL[link.section]}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">Abrir documento</p>
                          <div className="mt-3 h-1.5 rounded-full bg-slate-200">
                            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: "78%" }} />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {mode !== "overview" ? (
            <section className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{pageLabel}</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{pageLabel}</h2>
                    <p className="mt-2 text-sm text-slate-500">Selecciona un documento con URL para ver su vista previa aquí.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pagePreviewSource && !pagePreviewUrl ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                        Sin preview
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                      {pageDocuments.length} documentos
                    </span>
                    {pageDocuments.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={removePageResource}
                          disabled={!canDeleteInCurrentSection}
                          title={canDeleteInCurrentSection ? "" : "No tienes permiso para eliminar recursos en esta sección"}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-rose-100"
                        >
                          Quitar
                        </button>
                        <button
                          type="button"
                          disabled={!canCreateInCurrentSection}
                          onClick={openPageCreator}
                          title={canCreateInCurrentSection ? "" : "No tienes permiso para agregar recursos en esta sección"}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${canCreateInCurrentSection ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                        >
                          Agregar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!canCreateInCurrentSection}
                        onClick={openPageCreator}
                        title={canCreateInCurrentSection ? "" : "No tienes permiso para agregar recursos en esta sección"}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${canCreateInCurrentSection ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                      >
                        Agregar
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {pageDocuments.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-slate-500">No hay recursos en esta página con URL. Abre Agregar y guarda un enlace para mostrarlo aquí.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {pageDocuments.map((link) => {
                        const isActive = pagePreviewSource?.id === link.id;

                        return (
                          <button
                            key={link.id}
                            type="button"
                            onClick={() => setSelectedDocumentId(link.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${isActive ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
                          >
                            {link.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
                  {pagePreviewUrl ? (
                    <iframe
                      title={pagePreviewSource?.title ?? pageLabel}
                      src={pagePreviewUrl}
                      className="h-[620px] w-full"
                    />
                  ) : (
                    <div className="flex h-[620px] items-center justify-center p-8 text-center text-sm text-slate-500">
                      {pagePreviewUnavailableReason}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)] lg:p-8">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Documentos Recientes</h3>
                <p className="mt-2 text-sm text-slate-500">Documentos vistos últimamente. Haz clic para abrirlos de nuevo.</p>

                <div className="mt-6 space-y-4">
                  {recentDocumentsToShow.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      Aún no has abierto documentos recientes.
                    </div>
                  ) : recentDocumentsToShow.map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
                          <span className="text-lg text-slate-500">▣</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{link.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{SECTION_LABEL[link.section]}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">Abrir documento</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Agregar recurso</h3>
            <p className="mt-1 text-sm text-slate-500">Completa la información del nuevo recurso.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Título</label>
                <input
                  type="text"
                  value={creating.title}
                  onChange={(event) => setCreating((current) => current ? { ...current, title: event.target.value } : current)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">URL</label>
                <input
                  type="text"
                  value={creating.url}
                  onChange={(event) => setCreating((current) => current ? { ...current, url: event.target.value } : current)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveCreate}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Crear recurso
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Quitar recurso</h3>
            <p className="mt-1 text-sm text-slate-500">Selecciona el recurso que deseas quitar.</p>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {pageDocuments.map((link) => (
                <label key={link.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="remove-resource"
                    checked={removeDraft.selectedId === link.id}
                    onChange={() => setRemoveDraft((current) => current ? { ...current, selectedId: link.id } : current)}
                  />
                  <span className="truncate text-sm text-slate-700">{link.title}</span>
                </label>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveDraft(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRemoveDraft}
                disabled={!canDeleteInCurrentSection}
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-rose-100"
              >
                Quitar recurso
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewUrl ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-4">
          <div className="mx-auto mt-6 flex h-[85vh] max-w-6xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Vista previa: {previewTitle}</h3>
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  setPreviewTitle("");
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
            <iframe
              title={previewTitle}
              src={previewUrl}
              className="h-full w-full rounded-b-xl"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
