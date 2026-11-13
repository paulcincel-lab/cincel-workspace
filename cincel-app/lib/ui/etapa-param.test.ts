import { describe, expect, it } from "vitest";

import { parseTareasQuery, toTareasSearch } from "@/lib/tareas/query";
import { legacyRedirectTarget } from "@/lib/ui/legacy-redirects";
import { pickEtapaParam, readEtapaParam, rewriteLegacyEtapaUrl } from "@/lib/ui/etapa-param";

describe("?etapa= and the old ?tramo=", () => {
  it("reads etapa first, then the legacy tramo", () => {
    expect(readEtapaParam(new URLSearchParams("etapa=diseno"))).toBe("diseno");
    expect(readEtapaParam(new URLSearchParams("tramo=presale"))).toBe("presale");
    expect(readEtapaParam(new URLSearchParams("etapa=diseno&tramo=presale"))).toBe("diseno");
    expect(readEtapaParam(new URLSearchParams(""))).toBeNull();
    expect(pickEtapaParam({ tramo: "obra" })).toBe("obra");
  });

  it("rewrites a URL with tramo to etapa, keeping the other params, and leaves others alone", () => {
    const next = rewriteLegacyEtapaUrl(new URL("https://x.test/tareas?estilo=analitico&tramo=diseno&q=a"));
    expect(`${next?.pathname}${next?.search}`).toBe("/tareas?estilo=analitico&q=a&etapa=diseno");
    expect(rewriteLegacyEtapaUrl(new URL("https://x.test/tareas?etapa=diseno"))).toBeNull();
    const both = rewriteLegacyEtapaUrl(new URL("https://x.test/tareas?tramo=a&etapa=b"));
    expect(both?.search).toBe("?etapa=b");
  });

  it("the Tareas query parses the old param and writes the new one", () => {
    expect(parseTareasQuery(new URLSearchParams("tramo=diseno")).tramo).toBe("diseno");
    expect(toTareasSearch({ tramo: "diseno" })).toBe("?etapa=diseno");
  });

  it("legacy redirects carry the stage as etapa", () => {
    expect(legacyRedirectTarget("/actividades/diseno")).toBe("/tareas?estilo=analitico&etapa=diseno");
    expect(legacyRedirectTarget("/configuracion/tramos")).toBe("/ajustes/etapas");
    expect(legacyRedirectTarget("/configuracion/workflows")).toBe("/ajustes/etapas");
    expect(legacyRedirectTarget("/dashboard", new URLSearchParams("tramo=x"))).toBe("/inicio?etapa=x");
  });
});
