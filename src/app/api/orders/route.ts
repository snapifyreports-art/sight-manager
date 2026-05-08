import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const status = searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (jobId) where.jobId = jobId;
  if (status) where.status = status;

  // Filter by user's site access
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  if (siteIds !== null) {
    where.job = { plot: { siteId: { in: siteIds } } };
  }

  const orders = await prisma.materialOrder.findMany({
    where,
    include: {
      supplier: true,
      contact: true,
      orderItems: true,
      job: {
        include: {
          plot: { include: { site: true } },
        },
      },
    },
    orderBy: { dateOfOrder: "desc" },
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    supplierId,
    jobId,
    contactId,
    orderDetails,
    orderType,
    expectedDeliveryDate,
    leadTimeDays,
    itemsDescription,
    items,
  } = body as {
    supplierId: string;
    jobId: string;
    contactId?: string;
    orderDetails?: string;
    orderType?: string;
    expectedDeliveryDate?: string;
    leadTimeDays?: number | string;
    itemsDescription?: string;
    items?: Array<{ name: string; quantity: number; unit: string; unitCost: number }>;
  };

  if (!supplierId || !jobId) {
    return NextResponse.json(
      { error: "supplierId and jobId are required" },
      { status: 400 }
    );
  }

  // Guard: caller must have access to the job's site
  const jobForCheck = await prisma.job.findUnique({
    where: { id: jobId },
    select: { plot: { select: { siteId: true } } },
  });
  if (!jobForCheck) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const accessibleSites = await getUserSiteIds(session.user.id, session.user.role);
  if (accessibleSites !== null && !accessibleSites.includes(jobForCheck.plot.siteId)) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 }
    );
  }

  try {
    const order = await prisma.materialOrder.create({
      data: {
        supplierId,
        jobId,
        contactId: contactId || null,
        orderDetails: orderDetails || null,
        orderType: orderType || null,
        expectedDeliveryDate: expectedDeliveryDate
          ? new Date(expectedDeliveryDate)
          : null,
        leadTimeDays: (() => {
          if (!leadTimeDays) return null;
          const n = parseInt(String(leadTimeDays), 10);
          return Number.isFinite(n) && n >= 0 ? n : null;
        })(),
        itemsDescription: itemsDescription || null,
        ...(items && items.length > 0
          ? {
              orderItems: {
                // Compute totalCost here. Schema defaults it to 0; if we
                // omit the field on create, the stored row has 0 and the
                // job page renders "= 0.00" even though the wizard UI
                // showed a valid line total. Other creation paths
                // (auto-reorder on job start, template propagation,
                // one-off orders, manual item add) all compute this —
                // only the wizard POST was missing it. Caught by Apr 22
                // smoke test on the Asbestos-survey one-off order.
                create: items.map((item) => {
                  const qty = Number(item.quantity) || 0;
                  const cost = Number(item.unitCost) || 0;
                  return {
                    name: item.name,
                    quantity: qty,
                    unit: item.unit,
                    unitCost: cost,
                    totalCost: qty * cost,
                  };
                }),
              },
            }
          : {}),
      },
      include: {
        supplier: true,
        contact: true,
        orderItems: true,
        job: {
          include: {
            plot: { include: { site: true } },
          },
        },
      },
    });

    await prisma.eventLog.create({
      data: {
        type: "ORDER_PLACED",
        description: `[${order.supplier.name}] Order created for ${order.job?.name ?? "one-off order"}`,
        siteId: order.job?.plot.siteId ?? order.siteId ?? null,
        plotId: order.job?.plotId ?? order.plotId ?? null,
        jobId: order.jobId,
        userId: session.user?.id || null,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create order");
  }
}
