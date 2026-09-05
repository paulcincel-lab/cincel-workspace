"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

import AppAvatar from "@/components/ui/AppAvatar";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { getCurrentAuthenticatedUser, logout } from "@/lib/auth/auth-service";
import { teamMembersPublic, type TeamMemberPublic as TeamMember } from "@/lib/data/team-public";
import { fetchTeamMembersPublic } from "@/lib/repositories/team-repository";
import { isAdministratorRole } from "@/lib/data/roles";
import { clearDashboardProfilePhoto, loadDashboardProfilePhoto, saveDashboardProfilePhoto } from "@/lib/auth/profile-photo";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";

type HeaderProps = {
  variant?: "default" | "profile";
};

type HeaderLinks = {
  instagram: string;
  website: string;
  email: string;
};

const HEADER_LINKS_STORAGE_KEY = "cincel.header.links.v1";
const FALLBACK_USER_ID = 2;
const ADMIN_USER_IDS = new Set([2]);
const DEFAULT_HEADER_LINKS: HeaderLinks = {
  instagram: "https://www.instagram.com/cincel.mx/",
  website: "https://www.cincel.mx/",
  email: "https://mail.google.com",
};
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

const headerActionClassName = "inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition hover:border-foreground/30 hover:bg-accent hover:text-foreground";
const headerActionIconClassName = "h-[18px] w-[18px]";

function SignOutIcon({ className = headerActionIconClassName }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M13 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DevelopmentMenu({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) {
    return null;
  }

  return (
    <details className="relative">
      <summary className="list-none cursor-pointer rounded-xl border border-border bg-popover px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
        Desarrollo
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border bg-popover p-2 shadow-lg">
        <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Accesos temporales</p>

        <nav className="space-y-1">
          <Link
            href="/login"
            className="block rounded-lg px-2 py-2 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            Login
          </Link>
          <Link
            href="/change-password"
            className="block rounded-lg px-2 py-2 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            Cambio obligatorio de contrasena
          </Link>
          <Link
            href="/profile"
            className="block rounded-lg px-2 py-2 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            Perfil
          </Link>
        </nav>
      </div>
    </details>
  );
}

function HeaderActions({ links }: { links: HeaderLinks }) {
  return (
    <div className="flex items-center gap-3">
      <a
        href={links.instagram}
        target="_blank"
        rel="noreferrer"
        className={headerActionClassName}
        aria-label="Abrir Instagram"
        title="Instagram"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={headerActionIconClassName}>
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
        </svg>
      </a>

      <a
        href={links.website}
        target="_blank"
        rel="noreferrer"
        className={headerActionClassName}
        aria-label="Abrir pagina web"
        title="Pagina web"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={headerActionIconClassName}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M3 12h18" stroke="currentColor" strokeWidth="2" />
          <path d="M12 3c2.5 2.7 4 5.8 4 9s-1.5 6.3-4 9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 3c-2.5 2.7-4 5.8-4 9s1.5 6.3 4 9" stroke="currentColor" strokeWidth="2" />
        </svg>
      </a>

      <a
        href={links.email.startsWith("http") ? links.email : `mailto:${links.email}`}
        target="_blank"
        rel="noreferrer"
        className={headerActionClassName}
        aria-label="Enviar correo"
        title="Correo"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={headerActionIconClassName}>
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" />
        </svg>
      </a>
    </div>
  );
}

function formatTodayLabel(): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Mexico_City",
  }).format(new Date())
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Pre-hydration seed — real roster comes from `fetchTeamMembersPublic()`. */
function loadTeamMembers(): TeamMember[] {
  return teamMembersPublic;
}

function loadHeaderLinks(): HeaderLinks {
  if (typeof window === "undefined") {
    return DEFAULT_HEADER_LINKS;
  }

  const stored = readStorage(HEADER_LINKS_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_HEADER_LINKS;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<HeaderLinks>;
    return {
      instagram: typeof parsed.instagram === "string" && parsed.instagram.trim() ? parsed.instagram.trim() : DEFAULT_HEADER_LINKS.instagram,
      website: typeof parsed.website === "string" && parsed.website.trim() ? parsed.website.trim() : DEFAULT_HEADER_LINKS.website,
      email: typeof parsed.email === "string" && parsed.email.trim() ? parsed.email.trim() : DEFAULT_HEADER_LINKS.email,
    };
  } catch {
    return DEFAULT_HEADER_LINKS;
  }
}

function resolveCurrentMember(members: TeamMember[], authenticatedMemberId: number | null): TeamMember {
  const byAuth = authenticatedMemberId
    ? members.find((member) => member.id === authenticatedMemberId && member.active)
    : null;

  if (byAuth) {
    return byAuth;
  }

  const byId = members.find((member) => member.id === FALLBACK_USER_ID && member.active);
  if (byId) {
    return byId;
  }

  return members.find((member) => member.active) ?? teamMembersPublic[0];
}

export default function Header({ variant = "default" }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const todayLabel = useMemo(() => (isMounted ? formatTodayLabel() : ""), [isMounted]);
  const [members, setMembers] = useState<TeamMember[]>(() => loadTeamMembers());
  const [profileImage, setProfileImage] = useState<string>("");
  const [headerLinks, setHeaderLinks] = useState<HeaderLinks>(() => loadHeaderLinks());
  const [isLinksEditorOpen, setIsLinksEditorOpen] = useState(false);
  const [isProfileImageMenuOpen, setIsProfileImageMenuOpen] = useState(false);
  const [linksDraft, setLinksDraft] = useState<HeaderLinks>(() => loadHeaderLinks());
  const [authenticatedMemberId, setAuthenticatedMemberId] = useState<number | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshMembers = (roster?: TeamMember[]) => {
      const authUser = getCurrentAuthenticatedUser();
      const nextMemberId = authUser?.member.id ?? null;
      const nextMembers = roster ?? loadTeamMembers();
      const nextCurrentMember = resolveCurrentMember(nextMembers, nextMemberId);

      setMembers(nextMembers);
      setProfileImage(loadDashboardProfilePhoto(nextCurrentMember.id));
      setHeaderLinks(loadHeaderLinks());
      setAuthenticatedMemberId(nextMemberId);
    };

    refreshMembers();
    void fetchTeamMembersPublic()
      .then((rows) => {
        if (rows.length > 0) refreshMembers(rows);
      })
      .catch(() => undefined);

    const onExternalChange = () => {
      void fetchTeamMembersPublic()
        .then((rows) => refreshMembers(rows.length > 0 ? rows : undefined))
        .catch(() => refreshMembers());
    };
    window.addEventListener("focus", onExternalChange);
    window.addEventListener("storage", onExternalChange);

    return () => {
      window.removeEventListener("focus", onExternalChange);
      window.removeEventListener("storage", onExternalChange);
    };
  }, []);

  const currentMember = useMemo(() => {
    if (!isMounted) {
      return null;
    }

    const byAuth = authenticatedMemberId
      ? members.find((member) => member.id === authenticatedMemberId && member.active)
      : null;

    if (byAuth) {
      return byAuth;
    }

    const byId = members.find((member) => member.id === FALLBACK_USER_ID && member.active);
    if (byId) {
      return byId;
    }

    return members.find((member) => member.active) ?? teamMembersPublic[0];
  }, [authenticatedMemberId, isMounted, members]);

  const profileSubtitle = useMemo(() => {
    if (!currentMember) {
      return "";
    }

    const role = currentMember.role?.trim();
    const area = currentMember.area?.trim();

    if (role && area) {
      return `${role} • ${area}`;
    }

    return role || area || "";
  }, [currentMember]);

  const currentInitial = currentMember?.name?.trim().charAt(0).toUpperCase() || "P";
  const currentName = currentMember?.name?.trim() || "Usuario";
  const isAdminProfile = Boolean(
    currentMember && (ADMIN_USER_IDS.has(currentMember.id) || isAdministratorRole(currentMember.role))
  );
  const hasAuthenticatedSession = authenticatedMemberId !== null;
  const canEditLinksInThisPage = isAdminProfile && pathname.startsWith("/configuracion");
  const shouldShowDevelopmentMenu = IS_DEVELOPMENT && pathname.startsWith("/configuracion");

  const handleProfileImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        return;
      }

      setProfileImage(result);
      saveDashboardProfilePhoto(currentMember?.id ?? null, result);
    };

    reader.readAsDataURL(file);
    event.target.value = "";
    setIsProfileImageMenuOpen(false);
  };

  const handleEditLinksClick = () => {
    setLinksDraft(headerLinks);
    setIsLinksEditorOpen((previous) => !previous);
  };

  const handleDraftLinkChange = (field: keyof HeaderLinks, value: string) => {
    setLinksDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveLinks = () => {
    const nextLinks: HeaderLinks = {
      instagram: linksDraft.instagram.trim() || DEFAULT_HEADER_LINKS.instagram,
      website: linksDraft.website.trim() || DEFAULT_HEADER_LINKS.website,
      email: linksDraft.email.trim() || DEFAULT_HEADER_LINKS.email,
    };

    setHeaderLinks(nextLinks);
    setLinksDraft(nextLinks);
    writeStorage(HEADER_LINKS_STORAGE_KEY, JSON.stringify(nextLinks));
    setIsLinksEditorOpen(false);
  };

  const handleRemoveProfileImage = () => {
    clearDashboardProfilePhoto(currentMember?.id ?? null);
    setProfileImage("");
    setIsProfileImageMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    setAuthenticatedMemberId(null);
    setProfileImage("");
    setMembers(loadTeamMembers());
    router.push("/login");
    router.refresh();
  };

  if (variant === "profile") {
    return (
      <header className="mb-10 px-1 py-2 sm:px-2 sm:py-3">

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="group flex flex-col items-center">
              <Input
                ref={profileImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfileImageChange}
                className="sr-only"
              />
              <div className="relative h-25 w-25 overflow-hidden rounded-full border-2 border-border bg-muted sm:h-30 sm:w-30">
                {profileImage ? (
                  <Image
                    src={profileImage}
                    alt={`Foto de ${currentMember?.name ?? "usuario"}`}
                    fill
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary text-3xl font-semibold text-primary-foreground">
                    {currentInitial}
                  </div>
                )}
              </div>
              <div className="relative mt-1">
                <Button
                  variant="link"
                  className="h-auto p-0 text-[10px] font-medium uppercase tracking-wide"
                  onClick={() => setIsProfileImageMenuOpen((previous) => !previous)}
                  aria-expanded={isProfileImageMenuOpen}
                  aria-haspopup="menu"
                >
                  Editar
                </Button>

                {isProfileImageMenuOpen ? (
                  <div className="absolute left-1/2 z-20 mt-2 w-28 -translate-x-1/2 rounded-xl border border-border bg-popover p-1 shadow-lg">
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start rounded-lg px-2 py-1.5 text-left text-[11px] font-medium"
                      onClick={() => profileImageInputRef.current?.click()}
                    >
                      Cambiar
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start rounded-lg px-2 py-1.5 text-left text-[11px] font-medium"
                      onClick={handleRemoveProfileImage}
                    >
                      Quitar
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
                {currentMember?.name ?? "Nombre del Usuario"}
              </h1>
              <p className="mt-1 text-base text-muted-foreground sm:text-xl">
                {profileSubtitle || "Puesto • Area"}
              </p>
            </div>
          </div>

          <div className="self-end sm:self-auto">
            <div className="flex items-center gap-2">
              <DevelopmentMenu isVisible={shouldShowDevelopmentMenu} />
              <HeaderActions links={headerLinks} />
              {hasAuthenticatedSession ? (
                <Button
                  variant="outline"
                  className="h-12 w-24 border-border bg-muted text-muted-foreground hover:border-foreground/30 hover:bg-accent hover:text-foreground"
                  onClick={handleLogout}
                  aria-label="Cerrar sesion"
                  title="Cerrar sesion"
                >
                  <SignOutIcon />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

      </header>
    );
  }

  return (
    <header className="mb-10">

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
          <AppAvatar name={currentName} showName={false} />

          <h1 className="text-xl font-bold text-foreground">
            {`Bienvenido, ${currentName}`}
          </h1>
        </div>

        <div className="self-end sm:self-auto">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <DevelopmentMenu isVisible={shouldShowDevelopmentMenu} />
              <HeaderActions links={headerLinks} />
              {hasAuthenticatedSession ? (
                <Button
                  variant="outline"
                  className="h-12 w-24 border-border bg-muted text-muted-foreground hover:border-foreground/30 hover:bg-accent hover:text-foreground"
                  onClick={handleLogout}
                  aria-label="Cerrar sesion"
                  title="Cerrar sesion"
                >
                  <SignOutIcon />
                </Button>
              ) : null}
            </div>
            {canEditLinksInThisPage ? (
              <>
                <Button
                  variant="link"
                  className="h-auto p-0 text-[10px] font-medium uppercase tracking-wide"
                  onClick={handleEditLinksClick}
                >
                  Editar links
                </Button>

                {isLinksEditorOpen ? (
                  <div className="w-72 rounded-xl border border-border bg-popover p-3 shadow-sm">
                    <div className="space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Instagram</span>
                        <Input
                          value={linksDraft.instagram}
                          onChange={(event) => handleDraftLinkChange("instagram", event.target.value)}
                          className="h-auto px-2 py-1 text-xs"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Pagina web</span>
                        <Input
                          value={linksDraft.website}
                          onChange={(event) => handleDraftLinkChange("website", event.target.value)}
                          className="h-auto px-2 py-1 text-xs"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">E-mail (URL o correo)</span>
                        <Input
                          value={linksDraft.email}
                          onChange={(event) => handleDraftLinkChange("email", event.target.value)}
                          className="h-auto px-2 py-1 text-xs"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto px-2 py-1 text-xs"
                        onClick={() => {
                          setIsLinksEditorOpen(false);
                          setLinksDraft(headerLinks);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="h-auto px-2 py-1 text-xs"
                        onClick={handleSaveLinks}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-2 text-muted-foreground" suppressHydrationWarning>
        {todayLabel || "Cargando fecha..."}
      </p>

    </header>
  );
}