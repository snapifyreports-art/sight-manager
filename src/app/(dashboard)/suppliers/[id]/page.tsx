import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SupplierDetailClient } from "@/components/suppliers/SupplierDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: supplier
      ? `${supplier.name} | Sight Manager`
      : "Supplier | Sight Manager",
  };
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [supplier, deliveredOrders] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id },
      include: {
        materials: { orderBy: { name: "asc" } },
        _count: { select: { orders: true } },
      },
    }),
    // All delivered orders for performance scoring
    prisma.materialOrder.findMany({
      where: { supplierId: id, status: "DELIVERED" },
      select: {
        id: true,
        expectedDeliveryDate: true,
        deliveredDate: true,
        dateOfOrder: true,
      },
    }),
  ]);

  if (!supplier) {
    notFound();
  }

  // Calculate performance metrics
  const ordersWithBoth = deliveredOrders.filter(
    (o) => o.expectedDeliveryDate && o.deliveredDate
  );
  const onTime = ordersWithBoth.filter(
    (o) => o.deliveredDate! <= o.expectedDeliveryDate!
  ).length;
  const totalDelivered = deliveredOrders.length;
  const onTimeRate = ordersWithBoth.length > 0
    ? Math.round((onTime / ordersWithBoth.length) * 100)
    : null;

  // Average days delta (positive = late, negative = early)
  let avgDaysDelta: number | null = null;
  if (ordersWithBoth.length > 0) {
    const totalDelta = ordersWithBoth.reduce((sum, o) => {
      const delta = Math.round(
        (o.deliveredDate!.getTime() - o.expectedDeliveryDate!.getTime()) /
          86400000
      );
      return sum + delta;
    }, 0);
    avgDaysDelta = Math.round(totalDelta / ordersWithBoth.length);
  }

  const performance = {
    totalOrders: supplier._count.orders,
    totalDelivered,
    onTimeRate,
    avgDaysDelta,
  };

  const serialized = {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    contactEmail: supplier.contactEmail,
    contactNumber: supplier.contactNumber,
    type: supplier.type,
    emailTemplate: supplier.emailTemplate,
    accountNumber: supplier.accountNumber,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
    _count: supplier._count,
    materials: supplier.materials.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      unitCost: m.unitCost,
      category: m.category,
      sku: m.sku,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
    performance,
  };

  return <SupplierDetailClient supplier={serialized} />;
}
