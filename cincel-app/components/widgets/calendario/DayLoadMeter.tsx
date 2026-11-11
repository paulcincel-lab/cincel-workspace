import type { LoadLabel } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type DayLoadMeterProps = { hours: number; workday: number; label: LoadLabel };

/** Load meter of a day. Markup belongs to Phase 5. */
export function DayLoadMeter({ hours, workday }: DayLoadMeterProps) {
  return <CalendarioStubSection label="Carga del día" titles={[`${hours} h de ${workday} h`]} />;
}
