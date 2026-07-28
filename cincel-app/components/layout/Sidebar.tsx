"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";

type IconProps = {
  className?: string;
};

type MenuLinkItem = {
  label: string;
  href: string;
  icon: (props: IconProps) => React.JSX.Element;
};

type MenuGroupItem = {
  label: string;
  icon: (props: IconProps) => React.JSX.Element;
  submenu: MenuLinkItem[];
};

type MenuItem = MenuLinkItem | MenuGroupItem;

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
  const [expandedMenu, setExpandedMenu] = useState<string | null>(
    pathname.startsWith("/recursos/empresa")
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

  const menu: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
    {
      label: "Actividades",
      icon: ActivityIcon,
      submenu: [
        { label: "General", href: "/tareas", icon: ActivityIcon },
        { label: "Presale", href: "/tareas/presale", icon: ActivityIcon },
        { label: "Taller de diseño", href: "/tareas/diseno", icon: ActivityIcon },
        { label: "Construccion", href: "/tareas/construccion", icon: ActivityIcon },
      ],
    },
    { label: "Calendario", href: "/calendario", icon: CalendarIcon },
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
    { label: "Proyectos", href: "/proyectos", icon: ProjectIcon },
    {
      label: "Proveedores",
      icon: SuppliersIcon,
      submenu: [
        { label: "Contratistas", href: "/proveedores/contratistas", icon: SuppliersIcon },
        { label: "Colaboradores", href: "/proveedores/colaboradores", icon: SuppliersIcon },
        { label: "Tiendas", href: "/proveedores/tiendas", icon: SuppliersIcon },
      ],
    },
    { label: "Clientes", href: "/clientes", icon: ClientsIcon },
    { label: "Equipo", href: "/equipo", icon: TeamIcon },
    {
      label: "Configuración",
      icon: SettingsIcon,
      submenu: [
        { label: "General", href: "/configuracion/general", icon: SettingsIcon },
        { label: "Permisos", href: "/configuracion/permisos", icon: SettingsIcon },
      ],
    },
  ];

  const isActivePath = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const currentProfileRole = (() => {
    for (const item of menu) {
      if (isGroup(item)) {
        const activeSub = item.submenu.find((sub) => isActivePath(sub.href));
        if (activeSub) return activeSub.label;
      } else if (isActivePath(item.href)) {
        return item.label;
      }
    }
    return "Perfil";
  })();

  const systemName = generalSettings.system.systemName.trim() || "Cincel Workspace";
  const systemLogoUrl = generalSettings.appearance.systemLogoUrl.trim();
  const [systemNamePrimary, ...systemNameRest] = systemName.split(" ");
  const systemNameSecondary = systemNameRest.join(" ");

  return (
    <aside className="w-64 h-screen bg-[#ECEFF6] border-r border-[#D9DEEA] text-slate-700 flex flex-col">
      <div className="px-5 pt-5 pb-3">
        {systemLogoUrl ? (
          <div className="mb-2 h-10 w-full overflow-hidden rounded-lg">
            <div
              aria-label={systemName}
              role="img"
              className="h-full w-full bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${systemLogoUrl})` }}
            />
          </div>
        ) : null}

        <h1 className="text-[34px] leading-[0.95] font-extrabold tracking-tight text-black">{systemNamePrimary || "Cincel"}</h1>
        {systemNameSecondary ? (
          <p className="text-[20px] leading-tight font-semibold text-black">{systemNameSecondary}</p>
        ) : null}
      </div>

      <div className="px-5 pb-4 border-b border-[#D9DEEA]">
        <div className="flex items-center gap-2.5">
          <Avatar name={currentProfileRole} showName={false} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-500">{currentProfileRole}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {menu.map((item) => {
          if (isGroup(item)) {
            const isExpanded = expandedMenu === item.label;
            const hasActive = item.submenu.some((sub) => isActivePath(sub.href));

            return (
              <div key={item.label}>
                <button
                  onClick={() => setExpandedMenu(isExpanded ? null : item.label)}
                  className={`w-full rounded-xl px-3 py-2.5 transition flex items-center justify-between ${
                    hasActive || isExpanded
                      ? "bg-[#2F63E7] text-white shadow-sm"
                      : "hover:bg-white/80 text-slate-600"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <item.icon className="h-[18px] w-[18px]" />
                    <span className="text-[13px] leading-none font-semibold">{item.label}</span>
                  </span>
                  <ChevronIcon className={`h-[14px] w-[14px] transition ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {isExpanded && (
                  <div className="ml-7 mt-1.5 pl-3 border-l border-[#BBC6DE] space-y-1">
                    {item.submenu.map((subitem) => {
                      const subActive = isActivePath(subitem.href);
                      return (
                        <Link
                          key={subitem.label}
                          href={subitem.href}
                          className={`block rounded-lg px-2.5 py-1.5 transition text-[11px] ${
                            subActive
                              ? "bg-white text-[#2F63E7] font-semibold"
                              : "text-slate-600 hover:bg-white/80"
                          }`}
                        >
                          {subitem.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = isActivePath(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`w-full rounded-xl px-3 py-2.5 transition flex items-center gap-2.5 ${
                active
                  ? "bg-[#2F63E7] text-white shadow-sm"
                  : "hover:bg-white/80 text-slate-600"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="text-[13px] leading-none font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}