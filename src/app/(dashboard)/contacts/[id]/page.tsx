import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContactDetailClient } from "@/components/contacts/ContactDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { name: true, company: true },
  });
  return {
    title: contact
      ? `${contact.company || contact.name} | Sight Manager`
      : "Contact | Sight Manager",
  };
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [contact, jobContractors, snags, documents, ordersAsContact] = await Promise.all([
    prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        company: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    // All jobs this contact is assigned to (across every site)
    prisma.jobContractor.findMany({
      where: { contactId: id },
      select: {
        job: {
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            stageCode: true,
            plot: {
              select: {
                id: true,
                plotNumber: true,
                name: true,
                site: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    // All snags assigned to this contact
    prisma.snag.findMany({
      where: { contactId: id },
      select: {
        id: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        plot: {
          select: {
            id: true,
            plotNumber: true,
            name: true,
            site: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // RAMS / method statements
    prisma.siteDocument.findMany({
      where: { contactId: id },
      select: {
        id: true,
        name: true,
        url: true,
        fileName: true,
        fileSize: true,
        category: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Orders linked to this contact (rare — only when contact is a supplier-of-sorts)
    prisma.materialOrder.findMany({
      where: { contactId: id },
      select: {
        id: true,
        status: true,
        itemsDescription: true,
        expectedDeliveryDate: true,
        deliveredDate: true,
        dateOfOrder: true,
        supplier: { select: { name: true } },
        job: {
          select: {
            id: true,
            name: true,
            plot: {
              select: {
                plotNumber: true,
                name: true,
                site: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { dateOfOrder: "desc" },
    }),
  ]);

  if (!contact) notFound();

  const jobs = jobContractors.map((jc) => ({
    id: jc.job.id,
    name: jc.job.name,
    status: jc.job.status,
    startDate: jc.job.startDate?.toISOString() ?? null,
    endDate: jc.job.endDate?.toISOString() ?? null,
    stageCode: jc.job.stageCode,
    plot: jc.job.plot,
  }));

  return (
    <ContactDetailClient
      contact={{
        ...contact,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      }}
      jobs={jobs}
      snags={snags.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        resolvedAt: s.resolvedAt?.toISOString() ?? null,
      }))}
      documents={documents.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))}
      orders={ordersAsContact.map((o) => ({
        ...o,
        expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
        deliveredDate: o.deliveredDate?.toISOString() ?? null,
        dateOfOrder: o.dateOfOrder.toISOString(),
      }))}
    />
  );
}
