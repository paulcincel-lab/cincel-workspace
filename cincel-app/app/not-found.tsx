import Link from "next/link";

import { NotFoundSearchButton } from "@/components/shell/NotFoundSearchButton";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { isNotFoundSearchAvailable, NOT_FOUND_COPY, NOT_FOUND_HOME_HREF } from "@/lib/ui/route-states";

/**
 * Staff not-found page (redesign FE §3.12, frame `Error404`): a CSS-shape
 * illustration, "No encontramos esta página", "Volver a Inicio" and
 * "Buscar", which opens the command palette only while the palette is
 * available.
 */
export default function NotFound() {
  const showSearch = isNotFoundSearchAvailable();

  return (
    <main className="flex min-h-[70vh] flex-1 flex-col items-center justify-center px-4 py-10">
      <section aria-labelledby="not-found-title" className="flex max-w-lg flex-col items-center gap-4 text-center">
        <NotFoundIllustration />
        <p className="font-mono text-sm text-muted-foreground">{NOT_FOUND_COPY.eyebrow}</p>
        <h1 id="not-found-title" className="text-2xl font-semibold tracking-tight text-foreground">
          {NOT_FOUND_COPY.title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{NOT_FOUND_COPY.description}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={NOT_FOUND_HOME_HREF} className={buttonVariants({ size: "lg" })}>
            {NOT_FOUND_COPY.home}
          </Link>
          {showSearch ? <NotFoundSearchButton /> : null}
        </div>
      </section>
    </main>
  );
}

/** A building with an unfinished extension and a crane, from plain shapes and theme tokens. */
function NotFoundIllustration() {
  return (
    <div aria-hidden="true" data-slot="not-found-illustration" className="relative h-[170px] w-[260px]">
      <span className="absolute bottom-0 left-5 h-2 w-[220px] rounded-full bg-border" />
      <span className="absolute bottom-2 left-10 h-[110px] w-[70px] rounded-t-lg border-2 border-primary/40 bg-primary/10" />
      <span className="absolute bottom-[60px] left-[58px] size-3.5 rounded-sm border-2 border-primary/40 bg-card" />
      <span className="absolute bottom-[60px] left-20 size-3.5 rounded-sm border-2 border-primary/40 bg-card" />
      <span className="absolute bottom-2 left-[66px] h-8 w-5 rounded-t bg-primary" />
      <span className="absolute bottom-2 left-[124px] h-[60px] w-[100px] rounded-t-lg border-2 border-dashed border-muted-foreground/50 bg-muted" />
      <span className="absolute bottom-[68px] left-[150px] h-[90px] w-1.5 rounded-sm bg-muted-foreground" />
      <span className="absolute bottom-[152px] left-[150px] h-1.5 w-[90px] rounded-sm bg-muted-foreground" />
      <span className="absolute bottom-28 left-[222px] h-10 w-0.5 bg-border" />
      <span className="absolute bottom-[98px] left-[214px] h-3.5 w-[18px] rounded-sm bg-foreground" />
    </div>
  );
}
