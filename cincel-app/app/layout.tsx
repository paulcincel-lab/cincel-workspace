import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono, Inter } from "next/font/google";
import AppRouteGuard from "@/components/auth/AppRouteGuard";
import SessionHydrator from "@/components/auth/SessionHydrator";
import { AppearanceProvider } from "@/components/shell/AppearanceProvider";
import { Toaster } from "@/components/ui/shadcn/sonner";
import QueryProvider from "@/components/providers/QueryProvider";
import { SessionAccessProvider } from "@/lib/auth/session-context";
import { getSessionAccess } from "@/lib/auth/session";
import { buildDefaultGeneralSettings } from "@/lib/settings/general-settings";
import { getGeneralSettings } from "@/lib/settings/general-settings-server";
import { GeneralSettingsProvider } from "@/lib/settings/use-general-settings";
import { primaryColorCss } from "@/lib/theme/primary-color";
import { getPrimaryColor } from "@/lib/theme/primary-color-server";
import type { ResolvedAppearance } from "@/lib/types/redesign";
import { appearanceStyleBlock, SYSTEM_MODE_SCRIPT } from "@/lib/ui/appearance-css";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import { APPEARANCE_BASE_CSS, textSizeClass } from "@/lib/ui/text-size";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Selectable in the theme editor (FE §4.1); not preloaded, so only the chosen family downloads.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Cincel Workspace",
  description: "ERP para despacho de arquitectura y construcción.",
};

/**
 * `<html>` props for flag-on users (FE §4.1, BE §8.2, reviews B2, B18):
 * `data-theme` always set (explicit modes from the server; in system mode the
 * head script corrects it before first paint), `.dark` in sync, the
 * appearance attributes and the text-size class. No `style` attribute.
 */
function redesignHtmlProps(appearance: ResolvedAppearance) {
  const dark = appearance.mode === "dark";
  const className = [
    geistSans.variable,
    geistMono.variable,
    inter.variable,
    dmSans.variable,
    "h-full antialiased",
    textSizeClass(appearance.textSize),
    dark ? "dark" : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    "data-theme": dark ? "dark" : "light",
    "data-mode": appearance.mode,
    "data-theme-id": appearance.theme,
    "data-style": appearance.style,
    "data-density": appearance.density,
    className,
  } as const;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [sessionAccess, primaryColor, appearance] = await Promise.all([
    getSessionAccess(),
    getPrimaryColor(),
    getResolvedAppearance(),
  ]);
  // Company details stay off pages rendered without a session (login, public routes).
  const generalSettings = sessionAccess.user ? (await getGeneralSettings()).settings : buildDefaultGeneralSettings();

  const app = (
    <QueryProvider>
      <SessionAccessProvider value={sessionAccess}>
        <SessionHydrator value={sessionAccess} />
        <GeneralSettingsProvider value={generalSettings}>
          <AppRouteGuard>{children}</AppRouteGuard>
        </GeneralSettingsProvider>
      </SessionAccessProvider>
    </QueryProvider>
  );
  // The one Toaster, for both shells (FE §3.1).
  const toaster = <Toaster position="bottom-right" offset={72} />;

  if (!appearance.redesignEnabled) {
    // Flag off (review B17): today's pipeline; no appearance block, attributes or head script.
    const primaryCss = primaryColorCss(primaryColor);
    return (
      <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">
          {primaryCss ? <style id="primary-color">{primaryCss}</style> : null}
          {app}
          {toaster}
        </body>
      </html>
    );
  }

  return (
    // In system mode the head script sets data-theme and the class before hydration.
    <html lang="es" {...redesignHtmlProps(appearance)} suppressHydrationWarning>
      <head>
        <style id="appearance" dangerouslySetInnerHTML={{ __html: appearanceStyleBlock(appearance.cssVars) }} />
        <style id="appearance-base" dangerouslySetInnerHTML={{ __html: APPEARANCE_BASE_CSS }} />
        {appearance.mode === "system" ? (
          <script id="appearance-mode" dangerouslySetInnerHTML={{ __html: SYSTEM_MODE_SCRIPT }} />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider initial={appearance}>{app}</AppearanceProvider>
        {toaster}
      </body>
    </html>
  );
}
