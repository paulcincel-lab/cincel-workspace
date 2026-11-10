"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { GoogleSetupBanner } from "@/components/configuracion/GoogleSetupBanner";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { inicioPageOptions } from "@/lib/query/options/inicio";
import { meProfileOptions } from "@/lib/query/options/me";

import { InicioAnalitico } from "./InicioAnalitico";
import { InicioEsencial } from "./InicioEsencial";
import { InicioVisual } from "./InicioVisual";

export type InicioClientProps = {
  /** `name` (full name) feeds the avatar initials; `firstName` alone is used without it. */
  me: { firstName: string; role: string; name?: string };
  /** ISO instant the page was rendered at, so server and client greet the same way. Defaults to now. */
  now?: string;
};

/**
 * /inicio client (redesign FE §3.2, §4.3): the Google setup banner and one
 * layout per style through `PageStyleLayout`, all from the hydrated
 * `qk.inicio()` query: Visual is `InicioVisual` (#989), Esencial
 * `InicioEsencial` (#990) and Analítico `InicioAnalitico` (#991). Each layout
 * draws its own header (`PageHeader`, with the Estilo switch). The viewer id
 * comes from `qk.me.profile()` (seeded by the shell). This component never
 * reads the style.
 */
export function InicioClient({ me, now }: InicioClientProps) {
  const { data: page } = useSuspenseQuery(inicioPageOptions());
  const profile = useQuery(meProfileOptions()).data;
  const [renderedAt] = useState(() => (now ? new Date(now) : new Date()));

  const data = page.inicio;

  return (
    <>
      {page.firstLogin.showGoogleSetupBanner ? <GoogleSetupBanner /> : null}
      <PageStyleLayout
        visual={() => <InicioVisual data={data} me={me} renderedAt={renderedAt} />}
        esencial={() => <InicioEsencial data={data} firstName={me.firstName} now={renderedAt} meId={profile?.id ?? null} />}
        analitico={() => <InicioAnalitico data={data} firstName={me.firstName} now={renderedAt} />}
      />
    </>
  );
}
