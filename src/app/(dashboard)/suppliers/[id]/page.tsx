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

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      materials: { orderBy: { name: "asc" } },
      _count: { select: { orders: true } },
    },
  });

  if (!supplier) {
    notFound();
  }

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
  };

  return <SupplierDetailClient supplier={serialized} />;
}
