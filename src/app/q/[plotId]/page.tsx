import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Public QR-redirect page. Per-plot QR codes encode `/q/<plotId>`
 * (NOT the internal /sites/X/plots/Y URL). When scanned:
 *
 *   1. Look up plot.shareToken.
 *   2. If present + shareEnabled → 302 redirect to /progress/<token>.
 *   3. Else → friendly "QR not yet active" page so the buyer doesn't
 *      hit a login wall.
 *
 * This indirection (vs encoding the share token in the QR directly)
 * means a rotated share link still works with the printed QR — the
 * QR is permanent for the life of the plot.
 *
 * (May 2026 audit #206) Pre-fix QRs encoded the internal app URL —
 * scanning the for-sale board QR sent buyers to a login screen.
 */

export default async function QrRedirectPage({
  params,
}: {
  params: Promise<{ plotId: string }>;
}) {
  const { plotId } = await params;

  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { shareToken: true, shareEnabled: true },
  });

  if (plot?.shareToken && plot.shareEnabled) {
    redirect(`/progress/${plot.shareToken}`);
  }

  // Plot exists but no share link, or link disabled. Friendly message.
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto size-12 text-amber-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-800">
          This QR isn&apos;t linked yet
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          The home this code points to doesn&apos;t have a customer page
          set up yet. Please get in touch with the site team.
        </p>
      </div>
    </div>
  );
}
