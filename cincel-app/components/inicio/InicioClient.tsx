"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { greetingFor, inicioDateLine, initialsOf } from "@/lib/inicio/header";
import type { InicioData } from "@/lib/types/redesign";

import { AttentionList } from "./AttentionList";
import { KpiTiles } from "./KpiTiles";
import { MyDayAgenda } from "./MyDayAgenda";
import { ProfilePhotoButton } from "./ProfilePhotoButton";
import { ProjectProgressList } from "./ProjectProgressList";
import { TramoDonut } from "./TramoDonut";
import { WeeklyPaceChart } from "./WeeklyPaceChart";
import { WorkloadBars } from "./WorkloadBars";

export type InicioClientProps = {
  data: InicioData;
  photoUrl: string | null;
  /** `name` (full name) feeds the avatar initials; `firstName` alone is used without it. */
  me: { firstName: string; role: string; name?: string };
  /** ISO instant the page was rendered at, so server and client greet the same way. Defaults to now. */
  now?: string;
};

/** KPI key whose value is the "{m} tareas vencidas" count of the date line (BE §7.10). */
const OVERDUE_KPI = "vencidas";

/**
 * /inicio client (redesign FE §3.2, §4.3): the header block (photo, greeting,
 * role, date line, "Nueva tarea", `EstiloSwitch`) and the library widgets,
 * all from one `InicioData`. Every style difference lives in the widgets;
 * this component never reads the style.
 */
export function InicioClient({ data, photoUrl, me, now }: InicioClientProps) {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(photoUrl);
  const [renderedAt] = useState(() => (now ? new Date(now) : new Date()));

  const overdue = data.kpis.find((k) => k.key === OVERDUE_KPI)?.value ?? 0;
  const dateLine = inicioDateLine(renderedAt, { eventsToday: data.myDay.length, overdueTasks: overdue });
  const initials = initialsOf(me.name ?? me.firstName);

  function handlePhotoChange(url: string | null) {
    setPhoto(url);
    // The shell avatar reads the photo from the layout, which the upload route revalidated.
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col gap-4 in-data-[style=esencial]:mx-auto in-data-[style=esencial]:max-w-[980px]">
      <header className="flex flex-wrap items-start gap-4">
        <ProfilePhotoButton photoUrl={photo} initials={initials} onChange={handlePhotoChange} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-[22px] leading-tight font-semibold text-foreground">
            {greetingFor(renderedAt)}, {me.firstName}
          </h1>
          {me.role ? <p className="text-sm text-muted-foreground">{me.role}</p> : null}
          <p className="text-sm text-muted-foreground">{dateLine}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/tareas?nueva=1" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nueva tarea
          </Link>
          <EstiloSwitch scope="staff" />
        </div>
      </header>

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
    </div>
  );
}
