import { MisVacacionesClient } from "@/components/biblioteca/MisVacacionesClient";
import { VacationDeciders } from "@/components/biblioteca/VacationDeciders";
import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

import { loadMisVacaciones } from "./load-mis-vacaciones";

type SearchParams = Record<string, string | string[] | undefined>;

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

function styleOverride(value: SearchParams[string]): PresentationStyle | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return STYLES.find((s) => s === raw) ?? null;
}

/**
 * `/biblioteca/vacaciones` (redesign FE §3.7): Mis vacaciones in the new
 * shell; with the redesign off it redirects to the legacy section.
 * `?estilo=` overrides the style for this render only (FE §4.2).
 */
export default async function MisVacacionesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  await redirectIfRedesignOff("/biblioteca/vacaciones", params);
  const data = await loadMisVacaciones();
  const page = (
    <div className="flex flex-col gap-6">
      <MisVacacionesClient {...data} />
      <VacationDeciders />
    </div>
  );
  const override = styleOverride(params.estilo);
  if (!override) return page;
  return (
    <StyleProvider style={override} scope="staff" isOverridden>
      {page}
    </StyleProvider>
  );
}
