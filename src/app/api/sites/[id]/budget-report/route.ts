import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/budget-report
// Compares template (budgeted) costs vs actual order costs per plot & job
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  // Get all plots with their jobs, orders, and order items
  const plots = await prisma.plot.findMany({
    where: { siteId: id },
    select: {
      id: true,
      plotNumber: true,
      name: true,
      houseType: true,
      jobs: {
        select: {
          id: true,
          name: true,
          stageCode: true,
          status: true,
          sortOrder: true,
          orders: {
            select: {
              id: true,
              status: true,
              orderItems: {
                select: {
                  name: true,
                  quantity: true,
                  unitCost: true,
                  totalCost: true,
                },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
  });

  // Get template budgets for reference (all templates)
  const templates = await prisma.plotTemplate.findMany({
    select: {
      id: true,
      name: true,
      typeLabel: true,
      jobs: {
        select: {
          id: true,
          name: true,
          stageCode: true,
          sortOrder: true,
          parentId: true,
          orders: {
            select: {
              items: {
                select: {
                  name: true,
                  quantity: true,
                  unitCost: true,
                },
              },
            },
          },
          children: {
            select: { name: true, sortOrder: true },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  // Build template budget lookup by template name (using typeLabel or name)
  const templateBudgets: Record<
    string,
    { templateName: string; jobs: Record<string, number> ; total: number }
  > = {};

  for (const tmpl of templates) {
    const jobBudgets: Record<string, number> = {};
    let templateTotal = 0;

    for (const tj of tmpl.jobs) {
      let jobBudget = 0;
      for (const to of tj.orders) {
        for (const item of to.items) {
          jobBudget += item.quantity * item.unitCost;
        }
      }
      // Parent-stage orders attach to the real parent Job on apply (H3 hierarchy),
      // so the budget is keyed by the template job's own name — whether parent or child.
      jobBudgets[tj.name] = (jobBudgets[tj.name] || 0) + jobBudget;
      templateTotal += jobBudget;
    }

    const key = tmpl.typeLabel || tmpl.name;
    templateBudgets[key] = {
      templateName: tmpl.name,
      jobs: jobBudgets,
      total: templateTotal,
    };
  }

  // Calculate actuals per plot
  const plotReports = plots.map((plot) => {
    // Try to match a template by houseType
    const templateKey = plot.houseType || "";
    const template = templateBudgets[templateKey] ?? null;

    let plotBudget = template?.total ?? 0;
    let plotDelivered = 0;
    let plotCommitted = 0;
    let plotPending = 0;

    const jobBreakdown = plot.jobs.map((job) => {
      const budgeted = template?.jobs[job.name] ?? 0;

      // committed = money actually locked in with a supplier: ORDERED + DELIVERED.
      // PENDING orders (not yet placed) are excluded so we don't over-report spend.
      // This definition is consistent with /api/sites/[id]/cash-flow.
      let delivered = 0;
      let committed = 0;
      let pending = 0;
      for (const order of job.orders) {
        if (order.status === "CANCELLED") continue;
        let orderTotal = 0;
        for (const item of order.orderItems) {
          orderTotal += item.totalCost;
        }
        if (order.status === "PENDING") {
          pending += orderTotal;
        } else if (order.status === "DELIVERED") {
          delivered += orderTotal;
          committed += orderTotal;
        } else {
          // ORDERED / CONFIRMED
          committed += orderTotal;
        }
      }

      plotDelivered += delivered;
      plotCommitted += committed;
      plotPending += pending;

      const variance = committed - budgeted;
      const variancePercent =
        budgeted > 0 ? Math.round((variance / budgeted) * 100) : committed > 0 ? 100 : 0;

      return {
        jobId: job.id,
        jobName: job.name,
        status: job.status,
        budgeted: Math.round(budgeted * 100) / 100,
        actual: Math.round(delivered * 100) / 100,
        delivered: Math.round(delivered * 100) / 100,
        committed: Math.round(committed * 100) / 100,
        pending: Math.round(pending * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variancePercent,
        orderCount: job.orders.filter((o) => o.status !== "CANCELLED").length,
      };
    });

    const plotVariance = plotCommitted - plotBudget;

    return {
      plotId: plot.id,
      plotNumber: plot.plotNumber,
      plotName: plot.name,
      houseType: plot.houseType,
      templateMatched: template?.templateName ?? null,
      budgeted: Math.round(plotBudget * 100) / 100,
      actual: Math.round(plotCommitted * 100) / 100,
      delivered: Math.round(plotDelivered * 100) / 100,
      committed: Math.round(plotCommitted * 100) / 100,
      pending: Math.round(plotPending * 100) / 100,
      variance: Math.round(plotVariance * 100) / 100,
      variancePercent:
        plotBudget > 0
          ? Math.round((plotVariance / plotBudget) * 100)
          : plotCommitted > 0
            ? 100
            : 0,
      jobs: jobBreakdown,
    };
  });

  // Site-wide totals
  const siteBudget = plotReports.reduce((sum, p) => sum + p.budgeted, 0);
  const siteDelivered = plotReports.reduce((sum, p) => sum + p.delivered, 0);
  const siteCommitted = plotReports.reduce((sum, p) => sum + p.committed, 0);
  const sitePending = plotReports.reduce((sum, p) => sum + p.pending, 0);
  const siteActual = siteCommitted; // backward compat alias
  const siteVariance = siteCommitted - siteBudget;

  // Top cost overruns
  const allJobVariances = plotReports.flatMap((p) =>
    p.jobs
      .filter((j) => j.variance > 0)
      .map((j) => ({
        plotNumber: p.plotNumber,
        plotName: p.plotName,
        jobName: j.jobName,
        variance: j.variance,
        variancePercent: j.variancePercent,
      }))
  );
  allJobVariances.sort((a, b) => b.variance - a.variance);

  return NextResponse.json({
    siteId: id,
    generatedAt: new Date().toISOString(),
    siteSummary: {
      totalBudgeted: Math.round(siteBudget * 100) / 100,
      totalActual: Math.round(siteActual * 100) / 100,
      totalDelivered: Math.round(siteDelivered * 100) / 100,
      totalCommitted: Math.round(siteCommitted * 100) / 100,
      totalPending: Math.round(sitePending * 100) / 100,
      totalVariance: Math.round(siteVariance * 100) / 100,
      variancePercent:
        siteBudget > 0 ? Math.round((siteVariance / siteBudget) * 100) : 0,
      plotCount: plotReports.length,
      plotsOverBudget: plotReports.filter((p) => p.variance > 0).length,
      plotsUnderBudget: plotReports.filter((p) => p.variance < 0).length,
      plotsOnBudget: plotReports.filter((p) => p.variance === 0).length,
    },
    topOverruns: allJobVariances.slice(0, 10),
    plots: plotReports,
    availableTemplates: Object.entries(templateBudgets).map(([key, val]) => ({
      key,
      templateName: val.templateName,
      totalBudget: Math.round(val.total * 100) / 100,
    })),
  });
}
