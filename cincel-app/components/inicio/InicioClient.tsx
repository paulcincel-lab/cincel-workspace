"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { GoogleSetupBanner } from "@/components/configuracion/GoogleSetupBanner";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { StyleContent } from "@/components/widgets/StyleContent";
import { greetingFor, inicioDateLine, initialsOf } from "@/lib/inicio/header";
import { inicioPageOptions } from "@/lib/query/options/inicio";
import { meProfileOptions } from "@/lib/query/options/me";

import { AttentionList } from "./AttentionList";
import { InicioVisual } from "./InicioVisual";
import { KpiTiles } from "./KpiTiles";
import { MyDayAgenda } from "./MyDayAgenda";
import { ProfilePhotoButton } from "./ProfilePhotoButton";
import { ProjectProgressList } from "./ProjectProgressList";
import { TramoDonut } from "./TramoDonut";
import { WeeklyPaceChart } from "./WeeklyPaceChart";
import { WorkloadBars } from "./WorkloadBars";

export type InicioClientProps = {
  /** `name` (full name) feeds the avatar initials; `firstName` alone is used without it. */
  me: { firstName: string; role: string; name?: string };
  /** ISO instant the page was rendered at, so server and client greet the same way. Defaults to now. */
  now?: string;
};

/** KPI key whose value is the "{m} tareas vencidas" count of the date line (BE §7.10). */
const OVERDUE_KPI = "vencidas";

/**
 * /inicio client (redesign FE §3.2, §4.3): the Google setup banner, the
 * header block (photo, then `PageHeader`: greeting title, role badge, date
 * line description, "Nueva tarea" and the Estilo switch) and the library
 * widgets, all from the hydrated
 * `qk.inicio()` query. The photo is `qk.me.profile()` (seeded by the shell),
 * which the upload mutation writes, so this avatar and the shell's change
 * together. `PageStyleLayout` picks the layout per style: Visual is
 * `InicioVisual` (#989, no photo or role line in its header); Esencial and
 * Analítico share the widget layout. This component never reads the style.
 */
export function InicioClient({ me, now }: InicioClientProps) {
  const { data: page } = useSuspenseQuery(inicioPageOptions());
  const photoUrl = useQuery(meProfileOptions()).data?.photoUrl ?? null;
  const [renderedAt] = useState(() => (now ? new Date(now) : new Date()));

  const data = page.inicio;
  const overdue = data.kpis.find((k) => k.key === OVERDUE_KPI)?.value ?? 0;
  const dateLine = inicioDateLine(renderedAt, { eventsToday: data.myDay.length, overdueTasks: overdue });
  const initials = initialsOf(me.name ?? me.firstName);

  // Esencial and Analítico render the shared widget layout.
  const sharedLayout = () => (
    <StyleContent className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <ProfilePhotoButton photoUrl={photoUrl} initials={initials} />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={`${greetingFor(renderedAt)}, ${me.firstName}`}
            badge={me.role ? <Badge variant="secondary">{me.role}</Badge> : null}
            description={dateLine}
            actions={
              <Link href="/tareas?nueva=1" className={buttonVariants()}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                Nueva tarea
              </Link>
            }
          />
        </div>
      </div>

      <KpiTiles items={data.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TramoDonut
          title="Tareas abiertas por tramo"
          segments={data.tasksByTramo}
          totalLabel="Abiertas"
          secondaryLabel="Vencidas"
          extraColumns={[{ key: "diasProm", label: "Días prom." }]}
        />
        <WeeklyPaceChart weeks={data.weeklyPace} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionList items={data.attention} />
        <MyDayAgenda items={data.myDay} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProjectProgressList items={data.projectsProgress} />
        <WorkloadBars people={data.workload} />
      </div>
    </StyleContent>
  );

  return (
    <>
      {page.firstLogin.showGoogleSetupBanner ? <GoogleSetupBanner /> : null}
      <PageStyleLayout
        visual={() => <InicioVisual data={data} me={me} renderedAt={renderedAt} />}
        esencial={sharedLayout}
        analitico={sharedLayout}
      />
    </>
  );
}
