import { getBranding } from "@/lib/branding";

/**
 * (Jun 2026 white-label) Branded route-loading fallback for the dashboard
 * segment. Server component — resolves branding directly. Shows the customer
 * logo (or brand initial) above a primary-colour spinner, with the subtle
 * platform co-brand underneath.
 */
export default async function DashboardLoading() {
  const { customer, platform } = await getBranding();
  const initial = customer.brandName.trim().charAt(0).toUpperCase() || "S";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-4">
        {customer.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={customer.logoUrl}
            alt={customer.brandName}
            className="size-12 shrink-0 rounded-xl object-contain"
          />
        ) : (
          <div
            className="flex size-12 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: customer.primaryColor }}
          >
            {initial}
          </div>
        )}

        {/* Primary-colour spinner. Inline border colours so it picks up the
            tenant accent without depending on a Tailwind utility. */}
        <div
          className="size-8 animate-spin rounded-full border-2 border-slate-200"
          style={{ borderTopColor: customer.primaryColor }}
          role="status"
          aria-label="Loading"
        />
      </div>

      <p className="text-xs text-slate-400">{platform.poweredBy}</p>
    </div>
  );
}
