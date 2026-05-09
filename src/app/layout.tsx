import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/providers/SessionProvider";
import { ServiceWorkerRegistrar } from "@/components/providers/ServiceWorkerProvider";
import { DevDateProvider } from "@/lib/dev-date-context";
import { FetchPatchProvider } from "@/components/providers/FetchPatchProvider";
import { GlobalLoadingBar } from "@/components/layout/GlobalLoadingBar";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Sight Manager",
  description: "Construction Site Management",
  manifest: "/manifest.json",
  icons: {
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sight Manager",
  },
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
                {children}
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
