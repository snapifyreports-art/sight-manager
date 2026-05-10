import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <OfflineIndicator />
      <NotificationBlockedBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
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
