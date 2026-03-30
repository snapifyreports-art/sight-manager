import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { SuppliersAndContractorsPage } from "@/components/suppliers/SuppliersAndContractorsPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Suppliers & Contractors | Sight Manager",
};

export default async function SuppliersPage() {
  const [suppliers, contractors] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { orders: true, materials: true } } },
    }),
    prisma.contact.findMany({
      where: { type: "CONTRACTOR" },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedSuppliers = suppliers.map((s) => ({
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

  const serializedContractors = contractors.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    type: c.type as "SUPPLIER" | "CONTRACTOR",
    company: c.company,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <Suspense>
      <SuppliersAndContractorsPage
        suppliers={serializedSuppliers}
        contractors={serializedContractors}
      />
    </Suspense>
  );
}
