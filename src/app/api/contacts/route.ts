import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ContactType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const where: { type?: ContactType } = {};
  if (type === "SUPPLIER" || type === "CONTRACTOR") {
    where.type = type;
  }

  // Scope linked sites to what the caller can access
  const { getUserSiteIds } = await import("@/lib/site-access");
  const accessibleSiteIds = await getUserSiteIds(session.user.id, session.user.role);
  const jobContractorWhere = accessibleSiteIds === null
    ? {}
    : { job: { plot: { siteId: { in: accessibleSiteIds } } } };
  const orderWhere = accessibleSiteIds === null
    ? {}
    : { job: { plot: { siteId: { in: accessibleSiteIds } } } };

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      // Contractor-path: JobContractor links the contact to jobs → plot → site
      jobContractors: {
        where: jobContractorWhere,
        select: {
          job: {
            select: {
              status: true,
              plot: { select: { site: { select: { id: true, name: true, status: true } } } },
            },
          },
        },
      },
      // Supplier-contact path: MaterialOrder.contactId links contact to an order
      orders: {
        where: { ...orderWhere, status: { not: "CANCELLED" } },
        select: {
          status: true,
          job: {
            select: {
              plot: { select: { site: { select: { id: true, name: true, status: true } } } },
            },
          },
        },
      },
    },
  });

  // Derive linked sites per contact — count active jobs/orders per site
  const result = contacts.map((c) => {
    const siteMap = new Map<
      string,
      { id: string; name: string; status: string; activeJobs: number; totalJobs: number; openOrders: number }
    >();
    for (const jc of c.jobContractors) {
      const s = jc.job.plot.site;
      const e = siteMap.get(s.id) ?? { id: s.id, name: s.name, status: s.status, activeJobs: 0, totalJobs: 0, openOrders: 0 };
      e.totalJobs++;
      if (jc.job.status === "IN_PROGRESS" || jc.job.status === "NOT_STARTED") e.activeJobs++;
      siteMap.set(s.id, e);
    }
    for (const o of c.orders) {
      const s = o.job.plot.site;
      const e = siteMap.get(s.id) ?? { id: s.id, name: s.name, status: s.status, activeJobs: 0, totalJobs: 0, openOrders: 0 };
      if (o.status !== "DELIVERED") e.openOrders++;
      siteMap.set(s.id, e);
    }
    const { jobContractors: _jc, orders: _o, ...rest } = c;
    return { ...rest, linkedSites: Array.from(siteMap.values()).sort((a, b) => a.name.localeCompare(b.name)) };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, phone, type, company, notes } = body;

  if (!name || !type) {
    return NextResponse.json(
      { error: "name and type are required" },
      { status: 400 }
    );
  }

  if (type !== "SUPPLIER" && type !== "CONTRACTOR") {
    return NextResponse.json(
      { error: "type must be SUPPLIER or CONTRACTOR" },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      type,
      company: company || null,
      notes: notes || null,
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: `${type === "CONTRACTOR" ? "Contractor" : "Supplier"} "${name}"${company ? ` (${company})` : ""} added`,
      userId: session.user.id,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
