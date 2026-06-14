import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";
import { NotificationBlockedBanner } from "@/components/layout/NotificationBlockedBanner";
import { FloatingActions } from "@/components/shared/FloatingActions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  // (May 2026 audit #56 + audit K-1) Apply tenant branding via inline
  // style. Pre-fix only `--brand-primary` was set, which nothing in
  // the Tailwind theme actually consumed — changing the colour in
  // Settings did nothing visible. Now also override the canonical
  // design-system tokens so buttons, ring focus, sidebar primary, and
  // chart accent all pick up the tenant colour. Browsers accept hex
  // alongside the default oklch values without any conversion.
  // (Jun 2026 white-label) Resolve branding once and thread the identity
  // (logo + name) down to the chrome so the Sidebar/Header don't each
  // re-fetch /api/settings/branding. secondaryColor (when set) feeds the
  // accent + chart-2 tokens.
  const { customer } = await getBranding();
  const primaryColor = customer.primaryColor;
  const brandStyle = {
    "--brand-primary": primaryColor,
    "--primary": primaryColor,
    "--ring": primaryColor,
    "--sidebar-primary": primaryColor,
    "--chart-1": primaryColor,
    ...(customer.secondaryColor
      ? {
          "--brand-secondary": customer.secondaryColor,
          "--accent": customer.secondaryColor,
          "--chart-2": customer.secondaryColor,
        }
      : {}),
  } as React.CSSProperties;

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={brandStyle}
    >
      <OfflineIndicator />
      <NotificationBlockedBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar brandName={customer.brandName} logoUrl={customer.logoUrl} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header brandName={customer.brandName} logoUrl={customer.logoUrl} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      {/* (May 2026 audit #135) Mobile FAB for raise-snag / new-order /
          new-site. Wrapped in Suspense because FloatingActions reads
          searchParams via the next/navigation hook. */}
      <Suspense fallback={null}>
        <FloatingActions />
      </Suspense>
    </div>
  );
}
