import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppRouteGuard from "@/components/auth/AppRouteGuard";
import SessionHydrator from "@/components/auth/SessionHydrator";
import { Toaster } from "@/components/ui/shadcn/sonner";
import QueryProvider from "@/components/providers/QueryProvider";
import { SessionAccessProvider } from "@/lib/auth/session-context";
import { getSessionAccess } from "@/lib/auth/session";
import { buildDefaultGeneralSettings } from "@/lib/settings/general-settings";
import { getGeneralSettings } from "@/lib/settings/general-settings-server";
import { GeneralSettingsProvider } from "@/lib/settings/use-general-settings";
import { primaryColorCss } from "@/lib/theme/primary-color";
import { getPrimaryColor } from "@/lib/theme/primary-color-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cincel Workspace",
  description: "ERP para despacho de arquitectura y construcción.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [sessionAccess, primaryColor] = await Promise.all([getSessionAccess(), getPrimaryColor()]);
  const primaryCss = primaryColorCss(primaryColor);
  // Company details stay off pages rendered without a session (login, public routes).
  const generalSettings = sessionAccess.user ? (await getGeneralSettings()).settings : buildDefaultGeneralSettings();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {primaryCss ? <style id="primary-color">{primaryCss}</style> : null}
        <QueryProvider>
          <SessionAccessProvider value={sessionAccess}>
            <SessionHydrator value={sessionAccess} />
            <GeneralSettingsProvider value={generalSettings}>
              <AppRouteGuard>{children}</AppRouteGuard>
            </GeneralSettingsProvider>
          </SessionAccessProvider>
        </QueryProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
