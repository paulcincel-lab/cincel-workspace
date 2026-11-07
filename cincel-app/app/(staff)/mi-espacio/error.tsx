"use client";

import { ErrorState } from "@/components/shell/ErrorState";

type MiEspacioErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** /mi-espacio error state (redesign FE §3): "No se pudo cargar esta página." + "Reintentar". */
export default function MiEspacioError({ error, reset }: MiEspacioErrorProps) {
  return <ErrorState code={error.digest} onRetry={() => reset()} />;
}
