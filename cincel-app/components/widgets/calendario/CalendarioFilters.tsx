"use client";

import type { ReactNode } from "react";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";

import type { CalendarioFiltersProps } from "./calendario-filters-model";
import { CalendarioAnaliticoFilters } from "./CalendarioAnaliticoFilters";
import { CalendarioEsencialFilters } from "./CalendarioEsencialFilters";
import { CalendarioVisualFilters } from "./CalendarioVisualFilters";

/** The filters of /calendario in the Estilo's presentation: one state, three looks (FE §3). */
export function CalendarioFilters(props: CalendarioFiltersProps): ReactNode {
  return (
    <PageStyleLayout
      visual={() => <CalendarioVisualFilters {...props} />}
      esencial={() => <CalendarioEsencialFilters {...props} />}
      analitico={() => <CalendarioAnaliticoFilters {...props} />}
    />
  );
}
