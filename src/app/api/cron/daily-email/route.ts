import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { format } from "date-fns";
import { getServerCurrentDate, getServerStartOfDay } from "@/lib/dev-date";
import { getUserSiteIds } from "@/lib/site-access";
import { whereJobEndOverdue, whereJobStartOverdue } from "@/lib/lateness";

export const dynamic = "force-dynamic";

// GET /api/cron/daily-email
// Sends a daily morning brief email digest to managers (CEO, DIRECTOR, SITE_MANAGER)
// Scheduled at 6am UTC in vercel.json
export async function GET(req: NextRequest) {
  const { checkCronAuth } = await import("@/lib/cron-auth");
  const authCheck = checkCronAuth(req.headers.get("authorization"));
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 },
    );
  }

  // (#42) Route through getServerCurrentDate so Dev Mode tests can
  // simulate the morning email on a non-real date. Vercel cron sends
  // no dev-date cookie so production matches the previous behaviour.
  // (#87) UTC start-of-day so the boundary matches how Prisma stores
  // timestamps — see getServerStartOfDay() doc.
  const now = getServerCurrentDate(req);
  const todayStr = format(now, "yyyy-MM-dd");
  const todayStart = getServerStartOfDay(req);

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
        // (May 2026 audit D-P1-3) Route the overdue / late-start counts
        // through the Lateness SSOT (`@/lib/lateness`) so future
        // semantics changes propagate. Pre-fix: hand-rolled clauses,
        // coincidentally equivalent today, drifted on the next "what
        // counts as overdue" tweak. All job counts also filter to LEAF
        // jobs only since parents are derived rollups.
        prisma.job.count({
          where: { plot: { siteId: site.id }, ...whereJobEndOverdue(todayStart), children: { none: {} } },
        }),
        prisma.job.count({
          where: { plot: { siteId: site.id }, ...whereJobStartOverdue(todayStart), children: { none: {} } },
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

  // (May 2026 audit B-11) Get managers to email. Pre-fix
  // `email: { not: undefined }` was a no-op Prisma filter — it didn't
  // exclude anyone. Add SUPER_ADMIN to the role list (they bypass every
  // permission elsewhere; same goes for daily-brief eligibility). Also
  // exclude empty-string emails (User.email is non-null in the schema
  // but could be "" from legacy seed data).
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "CEO", "DIRECTOR", "SITE_MANAGER"] },
      email: { not: "" },
      // (May 2026 audit S-P0) Exclude archived (offboarded) users.
      archivedAt: null,
    },
    select: { id: true, name: true, email: true, role: true },
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
  const baseUrl =
    process.env.NEXTAUTH_URL ?? "https://sight-manager.vercel.app";

  // (May 2026 audit #140) Each alert / status chip in the email links
  // straight to the relevant in-app tab. Pre-fix the email was a dead
  // text summary — managers had to navigate the app from scratch.
  // Now clicking "3 overdue jobs" opens that site's Daily Brief tab,
  // "2 deliveries due" opens the Orders page filtered to that site,
  // etc.
  const linkChip = (
    label: string,
    color: { bg: string; fg: string },
    href: string,
  ) =>
    `<a href="${href}" style="background:${color.bg};color:${color.fg};padding:2px 8px;border-radius:9999px;font-size:11px;text-decoration:none;display:inline-block;">${label}</a>`;
  const linkAlert = (
    label: string,
    color: string,
    href: string,
  ) =>
    `<a href="${href}" style="color:${color};font-weight:600;text-decoration:none;border-bottom:1px dashed currentColor;">${label}</a>`;

  // (May 2026 audit D-6 / B-11) Per-manager scoping. Pre-fix every
  // manager — including a SITE_MANAGER assigned to one site — got an
  // email listing every active site in the system. Now build the rows
  // function once and call it per manager with their accessible
  // siteDigests.
  const buildSiteRows = (digests: typeof siteDigests) => digests
    .map((d) => {
      const siteUrl = `${baseUrl}/sites/${d.site.id}`;
      const alerts = [];
      if (d.overdueJobs > 0)
        alerts.push(
          linkAlert(
            `${d.overdueJobs} overdue job${d.overdueJobs !== 1 ? "s" : ""}`,
            "#dc2626",
            `${siteUrl}?tab=daily-brief`,
          ),
        );
      if (d.lateStarts > 0)
        alerts.push(
          linkAlert(
            `${d.lateStarts} late start${d.lateStarts !== 1 ? "s" : ""}`,
            "#ea580c",
            `${siteUrl}?tab=daily-brief`,
          ),
        );
      if (d.overdueDeliveries > 0)
        alerts.push(
          linkAlert(
            `${d.overdueDeliveries} overdue deliver${d.overdueDeliveries !== 1 ? "ies" : "y"}`,
            "#d97706",
            `${baseUrl}/orders?status=ORDERED&site=${d.site.id}`,
          ),
        );
      if (d.ordersToPlace > 0)
        alerts.push(
          linkAlert(
            `${d.ordersToPlace} order${d.ordersToPlace !== 1 ? "s" : ""} to place`,
            "#7c3aed",
            `${baseUrl}/orders?status=PENDING&site=${d.site.id}`,
          ),
        );

      const statusPills = [
        d.activeJobs > 0
          ? linkChip(
              `${d.activeJobs} active`,
              { bg: "#dbeafe", fg: "#1d4ed8" },
              `${siteUrl}?tab=programme`,
            )
          : null,
        d.jobsStartingToday > 0
          ? linkChip(
              `${d.jobsStartingToday} starting today`,
              { bg: "#dcfce7", fg: "#16a34a" },
              `${siteUrl}?tab=daily-brief`,
            )
          : null,
        d.deliveriesToday > 0
          ? linkChip(
              `${d.deliveriesToday} deliver${d.deliveriesToday !== 1 ? "ies" : "y"} due`,
              { bg: "#ede9fe", fg: "#7c3aed" },
              `${baseUrl}/orders?site=${d.site.id}`,
            )
          : null,
        d.openSnags > 0
          ? linkChip(
              `${d.openSnags} open snag${d.openSnags !== 1 ? "s" : ""}`,
              { bg: "#fef3c7", fg: "#b45309" },
              `${siteUrl}?tab=snags`,
            )
          : null,
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <div style="border:1px solid ${d.hasAlerts ? "#fca5a5" : "#e2e8f0"};border-radius:8px;padding:16px;margin:0 0 12px;background:${d.hasAlerts ? "#fff7f7" : "#fff"};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 8px;">
            <div>
              <a href="${siteUrl}" style="text-decoration:none;color:#0f172a;">
                <p style="margin:0;font-size:15px;font-weight:600;">${d.site.name}</p>
              </a>
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

  const buildEmailHtml = (
    digests: typeof siteDigests,
    totalAlerts: number,
  ) => `<!DOCTYPE html>
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
            <p style="margin:0;color:#dc2626;font-size:14px;font-weight:600;">${totalAlerts} item${totalAlerts !== 1 ? "s" : ""} need${totalAlerts === 1 ? "s" : ""} your attention across ${digests.filter((d) => d.hasAlerts).length} site${digests.filter((d) => d.hasAlerts).length !== 1 ? "s" : ""}.</p>
          </div>`
        : `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0;color:#16a34a;font-size:14px;font-weight:600;">All sites are on track today.</p>
          </div>`
      }
      <h2 style="margin:0 0 16px;font-size:16px;color:#0f172a;">Site Overview</h2>
      ${buildSiteRows(digests)}
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

  // Send a scoped email per manager — execs (SUPER_ADMIN/CEO/DIRECTOR)
  // get every site (getUserSiteIds returns null), SITE_MANAGERs get only
  // their UserSite-granted sites. Managers with zero accessible sites
  // are skipped (no point in a "no sites" email).
  let skippedNoAccess = 0;
  const results = await Promise.allSettled(
    managers
      .filter((m) => m.email && m.email.length > 0)
      .map(async (m) => {
        const accessibleSiteIds = await getUserSiteIds(m.id, m.role);
        const myDigests =
          accessibleSiteIds === null
            ? siteDigests
            : siteDigests.filter((d) => accessibleSiteIds.includes(d.site.id));
        if (myDigests.length === 0) {
          skippedNoAccess++;
          return;
        }
        const myAlerts = myDigests.reduce(
          (sum, d) => sum + d.overdueJobs + d.lateStarts + d.overdueDeliveries + d.ordersToPlace,
          0,
        );
        return sendEmail({
          to: m.email!,
          subject: `Daily Brief — ${dateLabel}${myAlerts > 0 ? ` (${myAlerts} action${myAlerts !== 1 ? "s" : ""} needed)` : ""}`,
          html: buildEmailHtml(myDigests, myAlerts),
        });
      }),
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
      description: `Daily brief email sent to ${sent} manager${sent !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed${failureHint})` : ""}${skippedNoAccess > 0 ? ` (${skippedNoAccess} skipped — no accessible sites)` : ""}`,
    },
  });

  return NextResponse.json({
    sent,
    failed,
    skippedNoAccess,
    managers: managers.length,
    sites: sites.length,
    date: todayStr,
  });
}
