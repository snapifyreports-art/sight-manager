import { prisma } from "@/lib/prisma";
import { ContactsClient } from "@/components/contacts/ContactsClient";

export const metadata = {
  title: "Contacts | Sight Manager",
};

export default async function ContactsPage() {
  const contacts = await prisma.contact.findMany({
    orderBy: { name: "asc" },
  });

  // Serialize dates for client component
  const serialized = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    type: c.type,
    company: c.company,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return <ContactsClient contacts={serialized} />;
}
