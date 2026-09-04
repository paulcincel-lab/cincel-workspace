"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/shadcn/sidebar";

type IconProps = {
  className?: string;
};

type MenuLinkItem = {
  label: string;
  href: string;
  icon: (props: IconProps) => React.JSX.Element;
  exact?: boolean;
};

type MenuGroupItem = {
  label: string;
  icon: (props: IconProps) => React.JSX.Element;
  submenu: MenuLinkItem[];
};

type MenuItem = MenuLinkItem | MenuGroupItem;

const PreviewIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M9.5 3h5" />
    <path d="M12 3v6" />
    <path d="M8.5 9 4.5 18.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-2.5L15.5 9" />
  </svg>
);

const DashboardIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const ProjectIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M3 7h18" />
    <path d="M7 3v8" />
    <rect x="3" y="5" width="18" height="16" rx="2" />
  </svg>
);

const ActivityIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M4 18h16" />
    <path d="M7 14l3-4 3 3 4-6" />
    <circle cx="7" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="13" cy="13" r="1" fill="currentColor" stroke="none" />
    <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const CalendarIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4" />
    <path d="M8 3v4" />
    <path d="M3 10h18" />
  </svg>
);

const TeamIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2" />
    <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M15 19c0-2.2 1.8-4 4-4 1 0 1.9.4 2.6 1" />
  </svg>
);

const ResourcesIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M12 3v18" />
    <path d="M3 12h18" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const CompanyIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h1" />
    <path d="M14 7h1" />
    <path d="M9 11h1" />
    <path d="M14 11h1" />
    <path d="M9 15h1" />
    <path d="M14 15h1" />
    <path d="M11 21v-3h2v3" />
  </svg>
);

const SuppliersIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M3 9h18" />
    <path d="M5 9V6h14v3" />
    <path d="M6 9v11h12V9" />
    <path d="M9 13h6" />
    <path d="M9 16h6" />
  </svg>
);

const ClientsIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <circle cx="8" cy="9" r="3" />
    <circle cx="16" cy="9" r="3" />
    <path d="M2 19c0-3 2.5-5.5 5.5-5.5h1" />
    <path d="M22 19c0-3-2.5-5.5-5.5-5.5h-1" />
  </svg>
);

const AssistantIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2z" />
    <path d="M9.5 9.5h5M9.5 12.5h3" />
  </svg>
);

const SettingsIcon = ({ className = "h-5 w-5" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

const ChevronIcon = ({ className = "h-4 w-4" }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const isGroup = (item: MenuItem): item is MenuGroupItem => "submenu" in item;

export default function Sidebar() {
  const generalSettings = useGeneralSettings();
  const pathname = usePathname();
  const [authenticatedUser, setAuthenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const [expandedMenu, setExpandedMenu] = useState<string | null>(
    pathname.startsWith("/v2")
      ? "Vista previa v2"
      : pathname.startsWith("/recursos/empresa")
      ? "Empresa"
      : pathname.startsWith("/recursos")
      ? "Recursos"
      : pathname.startsWith("/proveedores")
      ? "Proveedores"
      : pathname.startsWith("/tareas")
        ? "Actividades"
        : pathname.startsWith("/configuracion")
          ? "Configuración"
        : null,
  );

  useEffect(() => {
    const refreshUser = () => {
      setAuthenticatedUser(getCurrentAuthenticatedUser());
    };

    refreshUser();
    window.addEventListener("focus", refreshUser);
    window.addEventListener("storage", refreshUser);

    return () => {
      window.removeEventListener("focus", refreshUser);
      window.removeEventListener("storage", refreshUser);
    };
  }, []);

  const canViewConfiguration = authenticatedUser?.access === "Administrador";

  const menu: MenuItem[] = [
    {
      label: "Vista previa v2",
      icon: PreviewIcon,
      submenu: [
        { label: "Dashboard", href: "/v2/dashboard", icon: DashboardIcon },
        { label: "Proyectos", href: "/v2/proyectos", icon: ProjectIcon },
        { label: "Actividades", href: "/v2/actividades/diseno", icon: ActivityIcon },
        { label: "Equipo", href: "/v2/equipo", icon: TeamIcon },
        { label: "Directorio", href: "/v2/directorio", icon: ClientsIcon },
        { label: "Recursos", href: "/v2/recursos", icon: ResourcesIcon },
        { label: "Asistente", href: "/v2/asistente", icon: AssistantIcon },
      ],
    },
    { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
    {
      label: "Actividades",
      icon: ActivityIcon,
      submenu: [
        { label: "General", href: "/tareas", icon: ActivityIcon, exact: true },
        { label: "Presale", href: "/tareas/presale", icon: ActivityIcon },
        { label: "Taller de diseño", href: "/tareas/diseno", icon: ActivityIcon },
        { label: "Construccion", href: "/tareas/construccion", icon: ActivityIcon },
      ],
    },
    { label: "Calendario", href: "/calendario", icon: CalendarIcon },
    { label: "Proyectos", href: "/proyectos", icon: ProjectIcon },
    {
      label: "Recursos",
      icon: ResourcesIcon,
      submenu: [
        { label: "Mis documentos", href: "/recursos/mis-documentos", icon: ResourcesIcon },
        { label: "Mis favoritos", href: "/recursos/mis-favoritos", icon: ResourcesIcon },
        { label: "Plantillas de diseño", href: "/recursos/plantillas-diseno", icon: ResourcesIcon },
        { label: "Formatos de Obra", href: "/recursos/formatos-obra", icon: ResourcesIcon },
        { label: "Mis Vacaciones", href: "/recursos/mis-vacaciones", icon: ResourcesIcon },
        { label: "Formación", href: "/recursos/formacion", icon: ResourcesIcon },
      ],
    },
    {
      label: "Empresa",
      icon: CompanyIcon,
      submenu: [
        { label: "Book", href: "/recursos/empresa/book", icon: ResourcesIcon },
        { label: "Manual de la empresa", href: "/recursos/empresa/manual-de-la-empresa", icon: ResourcesIcon },
        { label: "Imagen de la empresa", href: "/recursos/empresa/imagen-de-la-empresa", icon: ResourcesIcon },
        { label: "RFC", href: "/recursos/empresa/rfc", icon: ResourcesIcon },
        { label: "Politicas de la empresa", href: "/recursos/empresa/politicas-de-la-empresa", icon: ResourcesIcon },
      ],
    },
    {
      label: "Proveedores",
      icon: SuppliersIcon,
      submenu: [
        { label: "Contratistas", href: "/proveedores/contratistas", icon: SuppliersIcon },
        { label: "Colaboradores", href: "/proveedores/colaboradores", icon: SuppliersIcon },
        { label: "Tiendas", href: "/proveedores/tiendas", icon: SuppliersIcon },
      ],
    },
    { label: "Equipo", href: "/equipo", icon: TeamIcon },
    { label: "Clientes", href: "/clientes", icon: ClientsIcon },
    { label: "Asistente", href: "/asistente", icon: AssistantIcon },
    ...(canViewConfiguration
      ? [
          {
            label: "Configuración",
            icon: SettingsIcon,
            submenu: [
              { label: "General", href: "/configuracion/general", icon: SettingsIcon },
              { label: "Permisos", href: "/configuracion/permisos", icon: SettingsIcon },
            ],
          } satisfies MenuGroupItem,
        ]
      : []),
  ];

  const isActivePath = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const currentProfileRole = (() => {
    for (const item of menu) {
      if (isGroup(item)) {
        const activeSub = item.submenu.find((sub) => isActivePath(sub.href, sub.exact));
        if (activeSub) return activeSub.label;
      } else if (isActivePath(item.href)) {
        return item.label;
      }
    }
    return "Perfil";
  })();

  const currentProfileLabel = "Pagina";
  const currentProfileInitial = currentProfileRole.charAt(0).toUpperCase();

  const systemName = generalSettings.system.systemName.trim() || "Cincel Workspace";
  const versionLabel = generalSettings.system.version.trim();
  const companyName = "Cincel";
  const [systemNamePrimary, ...systemNameRest] = systemName.split(" ");
  const systemNameSecondary = systemNameRest.join(" ");

  return (
    <SidebarProvider className="contents">
      <SidebarPrimitive collapsible="icon">
        <SidebarHeader className="gap-3 px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="px-1 group-data-[collapsible=icon]:hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/60">
                {companyName}
              </p>
              <h1 className="text-2xl leading-none font-extrabold tracking-tight text-sidebar-foreground">
                {systemNamePrimary || "Cincel"}
              </h1>
              {systemNameSecondary ? (
                <p className="text-sm font-semibold text-sidebar-foreground">{systemNameSecondary}</p>
              ) : null}
            </div>
            <SidebarTrigger />
          </div>

          <div className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-base font-bold text-sidebar-primary-foreground">
              {currentProfileInitial || "D"}
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <p className="text-sm leading-tight font-semibold text-sidebar-foreground">{currentProfileRole}</p>
              <p className="text-[10px] font-semibold tracking-[0.1em] text-sidebar-foreground/60 uppercase">
                {currentProfileLabel}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {menu.map((item) => {
                  if (isGroup(item)) {
                    const isExpanded = expandedMenu === item.label;
                    const hasActive = item.submenu.some((sub) => isActivePath(sub.href, sub.exact));

                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          isActive={hasActive}
                          tooltip={item.label}
                          onClick={() => setExpandedMenu(isExpanded ? null : item.label)}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                          <ChevronIcon
                            className={`ml-auto size-3.5 shrink-0 transition-transform group-data-[collapsible=icon]:hidden ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </SidebarMenuButton>

                        {isExpanded ? (
                          <SidebarMenuSub>
                            {item.submenu.map((subitem) => (
                              <SidebarMenuSubItem key={subitem.label}>
                                <SidebarMenuSubButton
                                  render={<Link href={subitem.href} />}
                                  isActive={isActivePath(subitem.href, subitem.exact)}
                                >
                                  {subitem.label}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  }

                  const active = isActivePath(item.href);
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-3 border-t border-sidebar-border px-3 py-3">
          <div className="flex items-center justify-center group-data-[collapsible=icon]:justify-center">
            <ThemeToggle />
          </div>
          <div className="text-center group-data-[collapsible=icon]:hidden">
            <p className="text-[11px] leading-5 font-medium text-sidebar-foreground/70">
              Software desarrollado por: Cincel despacho de Arquitectura
            </p>
            {versionLabel ? (
              <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-sidebar-foreground/50 uppercase">
                {versionLabel}
              </p>
            ) : null}
          </div>
        </SidebarFooter>
      </SidebarPrimitive>
    </SidebarProvider>
  );
}
