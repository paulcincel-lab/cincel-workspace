import { queryOptions } from "@tanstack/react-query";

import { getInicioPageData, type InicioPageData } from "@/lib/actions/page-data/inicio-actions";
import { STALE, qk } from "@/lib/query/keys";

/**
 * Inicio (`qk.inicio()`, plan §4.3, Phase 3): one page-data call, 30 s
 * stale. `/inicio` prefetches it on the server with `loadInicioPage`; the
 * other phases' mutations invalidate `qk.inicio()`.
 */
export const inicioPageOptions = () =>
  queryOptions<InicioPageData>({
    queryKey: qk.inicio(),
    queryFn: () => getInicioPageData({}),
    staleTime: STALE.screen,
  });
