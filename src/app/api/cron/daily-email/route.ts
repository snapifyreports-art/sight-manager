import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { format } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

// GET /api/cron/daily-email
// Sends a daily morning brief email digest to managers (CEO, DIRECTOR, SITE_MANAGER)
// Scheduled at 6am UTC in vercel.json
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // (#42) Route through getServerCurrentDate so Dev Mode tests can
  // simulate the morning email on a non-real date. Vercel cron sends
  // no dev-date cookie so production matches the previous behaviour.
  const now = getServerCurrentDate(req);
  const todayStr = format(now, "yyyy-MM-dd");
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get all active sites
  const sites = await prisma.site.findMany({
    where: { status: { not: "COMPLETED" } },
    select: { id: true, name: true, location: true },
  });

  if (sites.length === 0) {
    return NextResponse.json({ sent: 0, reason: "No active sites" });
  }

  // Get summary data for each site
  const siteDigests = await Promise.all(
    sites.map(async (site) => {
      const [
        overdueJobs,
        lateStarts,
        activeJobs,
        jobsStartingToday,
        deliveriesToday,
        overdueDeliveries,
        ordersToPlace,
        openSnags,
      ] = await Promise.all([
        // All job counts filter to LEAF jobs only (parents are derived rollups)
        prisma.job.count({
          where: { plot: { siteId: site.id }, endDate: { lt: todayStart }, status: { not: "COMPLETED" }, children: { none: {} } },
        }),
        prisma.job.count({
          where: { plot: { siteId: site.id }, status: "NOT_STARTED", startDate: { lt: todayStart }, children: { none: {} } },
        }),
        prisma.job.count({
          where: { plot: { siteId: site.id }, status: "IN_PROGRESS", children: { none: {} } },
        }),
        prisma.job.count({
          where: {
            plot: { siteId: site.id },
            startDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 86400000) },
            children: { none: {} },
            status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          },
        }),
        prisma.materialOrder.count({
          where: {
            job: { plot: { siteId: site.id } },
            expectedDeliveryDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 86400000) },
            status: "ORDERED",
          },
        }),
        prisma.materialOrder.count({
          where: {
            job: { plot: { siteId: site.id } },
            expectedDeliveryDate: { lt: todayStart },
            status: "ORDERED",
          },
        }),
        prisma.materialOrder.count({
          where: { job: { plot: { siteId: site.id } }, status: "PENDING" },
        }),
        prisma.snag.count({
          where: { plot: { siteId: site.id }, status: { in: ["OPEN", "IN_PROGRESS"] } },
        }),
      ]);

      return {
        site,
        overdueJobs,
        lateStarts,
        activeJobs,
        jobsStartingToday,
        deliveriesToday,
        overdueDeliveries,
        ordersToPlace,
        openSnags,
        hasAlerts: overdueJobs > 0 || lateStarts > 0 || overdueDeliveries > 0 || ordersToPlace > 0,
      };
    })
  );

  // Get managers to email (CEO, DIRECTOR, SITE_MANAGER with email set)
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ["CEO", "DIRECTOR", "SITE_MANAGER"] },
      email: { not: undefined },
    },
    select: { id: true, name: true, email: true },
  });

  if (managers.length === 0) {
    return NextResponse.json({ sent: 0, reason: "No managers with email" });
  }

  // Early-exit if email isn't configured — otherwise each manager's send
  // throws the same "RESEND_API_KEY is not set" error and we log a misleading
  // "N failed" with no explanation.
  if (!process.env.RESEND_API_KEY) {
    await prisma.eventLog.create({
      data: {
        type: "NOTIFICATION",
        description: `Daily brief email SKIPPED — RESEND_API_KEY not configured (${managers.length} manager${managers.length !== 1 ? "s" : ""} would have been notified)`,
      },
    });
    return NextResponse.json({
      sent: 0,
      failed: 0,
      skipped: managers.length,
      reason: "RESEND_API_KEY not configured in environment",
    });
  }

  // Build email HTML
  const dateLabel = format(now, "EEEE d MMMM yyyy");

  const siteRows = siteDigests
    .map((d) => {
      const alerts = [];
      if (d.overdueJobs > 0)
        alerts.push(`<span style="color:#dc2626;font-weight:600;">${d.overdueJobs} overdue job${d.overdueJobs !== 1 ? "s" : ""}</span>`);
      if (d.lateStarts > 0)
        alerts.push(`<span style="color:#ea580c;font-weight:600;">${d.lateStarts} late start${d.lateStarts !== 1 ? "s" : ""}</span>`);
      if (d.overdueDeliveries > 0)
        alerts.push(`<span style="color:#d97706;font-weight:600;">${d.overdueDeliveries} overdue deliver${d.overdueDeliveries !== 1 ? "ies" : "y"}</span>`);
      if (d.ordersToPlace > 0)
        alerts.push(`<span style="color:#7c3aed;font-weight:600;">${d.ordersToPlace} order${d.ordersToPlace !== 1 ? "s" : ""} to place</span>`);

      const statusPills = [
        d.activeJobs > 0 ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:9999px;font-size:11px;">${d.activeJobs} active</span>` : null,
        d.jobsStartingToday > 0 ? `<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:9999px;font-size:11px;">${d.jobsStartingToday} starting today</span>` : null,
        d.deliveriesToday > 0 ? `<span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:9999px;font-size:11px;">${d.deliveriesToday} deliver${d.deliveriesToday !== 1 ? "ies" : "y"} due</span>` : null,
        d.openSnags > 0 ? `<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:9999px;font-size:11px;">${d.openSnags} open snag${d.openSnags !== 1 ? "s" : ""}</span>` : null,
      ].filter(Boolean).join(" ");

      return `
        <div style="border:1px solid ${d.hasAlerts ? "#fca5a5" : "#e2e8f0"};border-radius:8px;padding:16px;margin:0 0 12px;background:${d.hasAlerts ? "#fff7f7" : "#fff"};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 8px;">
            <div>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${d.site.name}</p>
              ${d.site.location ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${d.site.location}</p>` : ""}
            </div>
            ${d.hasAlerts ? '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">ACTION NEEDED</span>' : '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:9999px;font-size:11px;">All clear</span>'}
          </div>
          ${alerts.length > 0 ? `<p style="margin:0 0 8px;font-size:13px;">${alerts.join(" &bull; ")}</p>` : ""}
          ${statusPills ? `<p style="margin:0;font-size:12px;">${statusPills}</p>` : ""}
        </div>
      `;
    })
    .join("");

  const totalAlerts = siteDigests.reduce(
    (sum, d) => sum + d.overdueJobs + d.lateStarts + d.overdueDeliveries + d.ordersToPlace,
    0
  );

  const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Sight Manager</h1>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Daily Brief — ${dateLabel}</p>
    </div>
    <div style="padding:32px;">
      ${totalAlerts > 0
        ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0;color:#dc2626;font-size:14px;font-weight:600;">${totalAlerts} item${totalAlerts !== 1 ? "s" : ""} need${totalAlerts === 1 ? "s" : ""} your attention across ${siteDigests.filter((d) => d.hasAlerts).length} site${siteDigests.filter((d) => d.hasAlerts).length !== 1 ? "s" : ""}.</p>
          </div>`
        : `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0;color:#16a34a;font-size:14px;font-weight:600;">All sites are on track today.</p>
          </div>`
      }
      <h2 style="margin:0 0 16px;font-size:16px;color:#0f172a;">Site Overview</h2>
      ${siteRows}
      <div style="margin:24px 0 0;text-align:center;">
        <a href="${process.env.NEXTAUTH_URL || "https://sight-manager.vercel.app"}" style="background:#2563eb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open Sight Manager</a>
      </div>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">Sent from Sight Manager &mdash; daily brief for ${dateLabel}</p>
    </div>
  </div>
</body>
</html>`;

  // Send to all managers
  const results = await Promise.allSettled(
    managers
      .filter((m) => m.email)
      .map((m) =>
        sendEmail({
          to: m.email!,
          subject: `Daily Brief — ${dateLabel}${totalAlerts > 0 ? ` (${totalAlerts} action${totalAlerts !== 1 ? "s" : ""} needed)` : ""}`,
          html: emailHtml,
        })
      )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failedResults = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected"
  );
  const failed = failedResults.length;

  // If everything failed, surface the underlying reason in the event log
  // so we don't just see "3 failed" forever with no explanation. Common
  // cases: Resend domain not verified, rate limit, invalid API key.
  let failureHint = "";
  if (failed > 0) {
    const firstReason = failedResults[0]?.reason;
    const msg =
      firstReason instanceof Error ? firstReason.message : String(firstReason);
    failureHint = ` — ${msg.slice(0, 140)}`;
  }

  // Log to event log
  await prisma.eventLog.create({
    data: {
      type: "NOTIFICATION",
      description: `Daily brief email sent to ${sent} manager${sent !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed${failureHint})` : ""}`,
    },
  });

  return NextResponse.json({
    sent,
    failed,
    managers: managers.length,
    sites: sites.length,
    date: todayStr,
  });
}
