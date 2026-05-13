/**
 * (#191) One-shot: run the lateness scanner logic locally against
 * prod DB to backfill LatenessEvent rows for everything currently
 * late. Same logic as /api/cron/lateness but runnable without HTTP.
 */
import { PrismaClient } from "@prisma/client";
import { openOrUpdateLateness } from "../src/lib/lateness-event";

const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sites = await prisma.site.findMany({
    where: { status: { not: "COMPLETED" } },
    select: { id: true },
  });
  const siteIds = sites.map((s) => s.id);
  let opened = 0;
  let updated = 0;

  const lateJobs = await prisma.job.findMany({
    where: {
      plot: { siteId: { in: siteIds } },
      children: { none: {} },
      OR: [
        { status: { not: "COMPLETED" }, endDate: { lt: today } },
        { status: "NOT_STARTED", startDate: { lt: today } },
      ],
    },
    select: {
      id: true, plotId: true, startDate: true, endDate: true, status: true,
      plot: { select: { siteId: true } },
    },
  });
  for (const j of lateJobs) {
    if (j.status !== "COMPLETED" && j.endDate && j.endDate < today) {
      const wentLateOn = new Date(j.endDate);
      wentLateOn.setHours(0, 0, 0, 0);
      wentLateOn.setDate(wentLateOn.getDate() + 1);
      const days = Math.max(1, Math.floor((today.getTime() - j.endDate.getTime()) / 86400000));
      const r = await openOrUpdateLateness(prisma, {
        kind: "JOB_END_OVERDUE", targetType: "job", targetId: j.id,
        siteId: j.plot.siteId, plotId: j.plotId, jobId: j.id,
        wentLateOn, daysLate: days,
      });
      r.created ? opened++ : updated++;
    }
    if (j.status === "NOT_STARTED" && j.startDate && j.startDate < today) {
      const wentLateOn = new Date(j.startDate);
      wentLateOn.setHours(0, 0, 0, 0);
      wentLateOn.setDate(wentLateOn.getDate() + 1);
      const days = Math.max(1, Math.floor((today.getTime() - j.startDate.getTime()) / 86400000));
      const r = await openOrUpdateLateness(prisma, {
        kind: "JOB_START_OVERDUE", targetType: "job", targetId: j.id,
        siteId: j.plot.siteId, plotId: j.plotId, jobId: j.id,
        wentLateOn, daysLate: days,
      });
      r.created ? opened++ : updated++;
    }
  }
  console.log(`Jobs late: opened ${opened}, updated ${updated}.`);

  const lateOrders = await prisma.materialOrder.findMany({
    where: {
      OR: [
        { status: "ORDERED", expectedDeliveryDate: { lt: today } },
        { status: "PENDING", dateOfOrder: { lt: today } },
      ],
    },
    select: {
      id: true, status: true, expectedDeliveryDate: true, dateOfOrder: true,
      jobId: true, plotId: true, siteId: true, contactId: true,
      job: { select: { plotId: true, plot: { select: { siteId: true } } } },
    },
  });
  let oOpened = 0, oUpdated = 0;
  for (const o of lateOrders) {
    const siteId = o.job?.plot?.siteId ?? o.siteId;
    if (!siteId || !siteIds.includes(siteId)) continue;
    const plotId = o.job?.plotId ?? o.plotId ?? null;
    if (o.status === "ORDERED" && o.expectedDeliveryDate && o.expectedDeliveryDate < today) {
      const wentLateOn = new Date(o.expectedDeliveryDate);
      wentLateOn.setHours(0, 0, 0, 0);
      wentLateOn.setDate(wentLateOn.getDate() + 1);
      const days = Math.max(1, Math.floor((today.getTime() - o.expectedDeliveryDate.getTime()) / 86400000));
      const r = await openOrUpdateLateness(prisma, {
        kind: "ORDER_DELIVERY_OVERDUE", targetType: "order", targetId: o.id,
        siteId, plotId, jobId: o.jobId ?? null, orderId: o.id,
        wentLateOn, daysLate: days, reasonCode: "MATERIAL_LATE",
        attributedContactId: o.contactId,
      });
      r.created ? oOpened++ : oUpdated++;
    }
    if (o.status === "PENDING" && o.dateOfOrder < today) {
      const wentLateOn = new Date(o.dateOfOrder);
      wentLateOn.setHours(0, 0, 0, 0);
      wentLateOn.setDate(wentLateOn.getDate() + 1);
      const days = Math.max(1, Math.floor((today.getTime() - o.dateOfOrder.getTime()) / 86400000));
      const r = await openOrUpdateLateness(prisma, {
        kind: "ORDER_SEND_OVERDUE", targetType: "order", targetId: o.id,
        siteId, plotId, jobId: o.jobId ?? null, orderId: o.id,
        wentLateOn, daysLate: days,
      });
      r.created ? oOpened++ : oUpdated++;
    }
  }
  console.log(`Orders late: opened ${oOpened}, updated ${oUpdated}.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
