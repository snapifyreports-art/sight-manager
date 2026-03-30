import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  redirect("/suppliers?tab=contractors");
}
