import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/providers/SessionProvider";
import { ServiceWorkerRegistrar } from "@/components/providers/ServiceWorkerProvider";
import { DevDateProvider } from "@/lib/dev-date-context";
import { FetchPatchProvider } from "@/components/providers/FetchPatchProvider";
import { GlobalLoadingBar } from "@/components/layout/GlobalLoadingBar";
import { ToastProvider } from "@/components/ui/toast";
import { BusyOverlayProvider } from "@/components/ui/busy-overlay";
import { LateSendPromptProvider } from "@/components/orders/LateSendPromptProvider";
import { getBranding } from "@/lib/branding";

// (Jun 2026 white-label) Metadata is now async so the browser tab title,
// title template, and PWA manifest all carry the CUSTOMER brand (falling
// back to the platform name for unbranded tenants). manifest now points at
// the dynamic /manifest.webmanifest (src/app/manifest.ts) instead of the
// static /manifest.json so it themes per tenant.
export async function generateMetadata(): Promise<Metadata> {
  const { customer } = await getBranding();
  const name = customer.brandName; // already resolved (falls back to platform)
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: `${name} — Construction Site Management`,
    manifest: "/manifest.webmanifest",
    icons: {
      apple: "/icons/icon-192.png",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: name,
    },
  };
}

// (May 2026 audit O-1 / UX-1) Viewport meta tag was missing entirely
// — every external mobile user (contractor token portal, customer
// progress page, ICS subscribe page) got a shrunk-to-fit desktop
// render on phones. Internal users hit it too on field-day phone use.
// `width=device-width` + `initialScale=1` is the standard responsive
// viewport. `maximumScale=5` keeps native pinch-to-zoom for users who
// need to zoom in on a photo or detail; never disable user-scaling on
// an a11y grounds.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <DevDateProvider>
            <TooltipProvider>
              <ToastProvider>
                <BusyOverlayProvider>
                  <LateSendPromptProvider>
                    {children}
                  </LateSendPromptProvider>
                </BusyOverlayProvider>
              </ToastProvider>
            </TooltipProvider>
          </DevDateProvider>
        </AuthProvider>
        <FetchPatchProvider />
        <GlobalLoadingBar />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
