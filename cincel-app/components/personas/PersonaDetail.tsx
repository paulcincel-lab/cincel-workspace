"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { ActivityFeedWidget } from "@/components/widgets/ActivityFeedWidget";
import { AttentionListWidget } from "@/components/widgets/AttentionListWidget";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { ProgressListWidget } from "@/components/widgets/ProgressListWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { cuttoLinks } from "@/lib/integrations/cutto-links";
import { personasDetailOptions } from "@/lib/query/options/personas";
import { etapaLabel } from "@/lib/etapas/compat";
import type { PersonaDetail as PersonaDetailData } from "@/lib/types/redesign";
import type { KpiDatum, PersonDatum } from "@/lib/types/widgets";

export type PersonaDetailProps = { detail: PersonaDetailData };

/** KPI key of "Horas esta semana" (BE §7.11). */
export const HOURS_STAT_KEY = "horas_semana";
/** KPI key of "Tareas abiertas" (BE §7.11). */
const OPEN_STAT_KEY = "abiertas";

/**
 * The stats to show: "Horas esta semana" only when the server returned the
 * person's hours (`weekHours` is null for viewers without `canViewTeamHours`
 * who are not the person, B4).
 */
export function visibleStats(detail: PersonaDetailData): KpiDatum[] {
  if (detail.weekHours !== null) return detail.stats;
  return detail.stats.filter((s) => s.key !== HOURS_STAT_KEY);
}

/** Title of the activity card (frames `PersonaDetalle`, `PersonaDetalleEsencial`). */
export const RECENT_ACTIVITY_TITLE = "Actividad reciente";
/** Shown when the person has no recent activity. */
export const RECENT_ACTIVITY_EMPTY = "Sin actividad reciente";

/** Full display name ("Nombre Apellido"). */
function fullName(detail: PersonaDetailData): string {
  const last = detail.staff.lastName?.trim();
  return last ? `${detail.staff.name} ${last}` : detail.person.name;
}

/** "Puesto · Etapa", from the person's puesto and etapa when present. */
function headerDescription(person: PersonDatum): string | undefined {
  const parts = [person.puesto?.trim() || null, person.etapa ? etapaLabel(person.etapa) : null].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Persona detalle (redesign FE §3.6, §4.7): header (avatar, puesto, etapa,
 * contact links incl. "Abrir chat en Cutto"), stats (`KpiWidget`), tareas asignadas
 * (`AttentionListWidget`), proyectos (`ProgressListWidget`) and the week's
 * availability as a single-row `PeopleWidget`, then "Actividad reciente"
 * (Visual and Esencial only, per the frames). Replaces the content of the
 * legacy `MemberProfileModal`. Every Visual / Esencial / Analítico difference
 * lives inside the widgets; this composition renders the same markup in every
 * style, except "Actividad reciente", which the Analítico frame leaves out.
 *
 * The server already filters the data (admin tasks only with
 * `canSeeAdminData`, hours only for `canViewTeamHours` or self); this
 * component renders exactly what it receives.
 */
export function PersonaDetail({ detail }: PersonaDetailProps) {
  const { staff, person } = detail;
  const name = fullName(detail);
  const stats = visibleStats(detail);
  const openCount = detail.stats.find((s) => s.key === OPEN_STAT_KEY)?.value ?? detail.tasks.length;
  const email = staff.email?.trim() || null;
  const phone = staff.phone?.trim() || null;
  const availabilityRow: PersonDatum = { ...person, name, availability: detail.availability };

  return (
    <div className="flex flex-col gap-4" data-testid="persona-detail">
      <div className="flex flex-wrap items-start gap-4">
        <Avatar size="lg" className="size-16">
          {person.photoUrl ? <AvatarImage src={person.photoUrl} alt={`Foto de ${name}`} /> : null}
          <AvatarFallback className="text-lg font-semibold">{person.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={name}
            description={headerDescription(person)}
            breadcrumb={[{ label: "Personas", href: "/personas" }, { label: name }]}
            actions={
              <>
                {phone ? (
                  <a href={`tel:${phone}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Phone aria-hidden="true" />
                    Llamar
                  </a>
                ) : null}
                {email ? (
                  <a href={`mailto:${email}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Mail aria-hidden="true" />
                    Correo
                  </a>
                ) : null}
                {email ? (
                  <a
                    href={cuttoLinks.personChatUrl(email) ?? undefined}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Abrir chat en Cutto con ${name} (se abre en una pestaña nueva)`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <MessageCircle aria-hidden="true" />
                    Abrir chat en Cutto
                  </a>
                ) : null}
              </>
            }
          />
        </div>
      </div>

      <KpiWidget items={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionListWidget
          title="Tareas asignadas"
          items={detail.tasks}
          totalCount={openCount}
          moreHref={`/tareas?responsable=${encodeURIComponent(staff.id)}`}
        />
        <div className="flex flex-col gap-4">
          <ProgressListWidget title="Proyectos" items={detail.projects} variant="bars" />
          <WidgetCard title="Disponibilidad esta semana">
            <PeopleWidget people={[availabilityRow]} show={["availability"]} layout="rows" />
          </WidgetCard>
        </div>
      </div>

      <ActivityFeedWidget
        title={RECENT_ACTIVITY_TITLE}
        emptyTitle={RECENT_ACTIVITY_EMPTY}
        items={detail.recentActivity}
      />
    </div>
  );
}

/**
 * `/personas/equipo/[id]` on the client (Query Migration 6):
 * `personas.detail(staffId)`, prefetched by the page and hydrated.
 */
export function PersonaDetailScreen({ staffId }: { staffId: string }) {
  const { data } = useQuery(personasDetailOptions(staffId));
  if (!data) return null;
  return <PersonaDetail detail={data} />;
}
