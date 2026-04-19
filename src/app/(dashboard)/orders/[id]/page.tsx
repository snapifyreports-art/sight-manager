import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/orders/[id]` — proper deep-link URL. Redirects to `/orders?orderId=ID`
 * which auto-opens the OrderDetailSheet on the list page.
 *
 * Why not a standalone page? The detail sheet UX is good in-app (keeps the
 * list context), but we still want shareable URLs for emails and direct
 * links. This redirect gives us both without duplicating the detail view.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/orders?orderId=${id}`);
}
