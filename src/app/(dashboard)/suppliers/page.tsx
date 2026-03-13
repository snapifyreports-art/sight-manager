import { prisma } from "@/lib/prisma";
import { SuppliersListClient } from "@/components/suppliers/SuppliersListClient";

export const metadata = {
  title: "Suppliers | Sight Manager",
};

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { orders: true, materials: true } },
    },
  });

  const serialized = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    contactName: s.contactName,
    contactEmail: s.contactEmail,
    contactNumber: s.contactNumber,
    type: s.type,
    accountNumber: s.accountNumber,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    _count: s._count,
  }));

  return <SuppliersListClient suppliers={serialized} />;
}
