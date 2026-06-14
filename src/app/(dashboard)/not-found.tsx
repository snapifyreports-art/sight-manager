import Link from "next/link";
import { getBranding } from "@/lib/branding";

/**
 * (Jun 2026 white-label) Branded 404 for the dashboard segment. Server
 * component — resolves branding directly so the "back home" accent + the
 * platform co-brand line match the tenant.
 */
export default async function DashboardNotFound() {
  const { customer, platform } = await getBranding();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <p
          className="text-5xl font-bold tracking-tight"
          style={{ color: customer.primaryColor }}
        >
          404
        </p>
        <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
        <p className="max-w-sm text-sm text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white shadow-md transition-all hover:brightness-110"
        style={{ backgroundColor: customer.primaryColor }}
      >
        Back to dashboard
      </Link>

      <p className="text-xs text-slate-400">{platform.poweredBy}</p>
    </div>
  );
}
