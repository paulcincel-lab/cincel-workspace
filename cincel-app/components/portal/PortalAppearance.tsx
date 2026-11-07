import type { ReactNode } from "react";

import {
  PORTAL_APPEARANCE_STYLE_ID,
  portalAppearanceCss,
} from "@/lib/portal/appearance-scope";
import type { ResolvedAppearance } from "@/lib/types/redesign";

type PortalAppearanceProps = {
  appearance: ResolvedAppearance;
  children: ReactNode;
};

/**
 * Applies the organization theme to every portal page (FE §3.11). With the redesign off it renders its children
 * untouched, so the portal looks exactly as today. With it on, a scoped `<style>` sets the org tokens on a
 * `display: contents` wrapper; there is no control a client could use to change them.
 */
export default function PortalAppearance({ appearance, children }: PortalAppearanceProps) {
  if (!appearance.redesignEnabled) return <>{children}</>;

  return (
    <>
      <style id={PORTAL_APPEARANCE_STYLE_ID}>{portalAppearanceCss(appearance.cssVars)}</style>
      <div data-portal-appearance="" data-theme-id={appearance.theme} className="contents text-foreground">
        {children}
      </div>
    </>
  );
}
