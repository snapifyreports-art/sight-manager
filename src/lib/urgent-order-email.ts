import type { SendOrderGroupInput } from "@/hooks/useOrderEmail";

/**
 * (#171) Build SendOrderGroupInput[] for the "Start anyway — send orders
 * now" pull-forward override flow.
 *
 * Given a list of order IDs that the server just flipped to ORDERED as
 * part of a pull-forward override, fetch each order's full email-needed
 * payload via /api/orders/[id], group by supplier, and return one
 * SendOrderGroupInput per supplier with the `urgent` + `skipStatusUpdate`
 * flags pre-set so the email composer prepends the URGENT banner and
 * doesn't re-flip the already-flipped orders.
 *
 * Groups without a supplier contactEmail are returned with an empty
 * recipient string — the user can paste a recipient before sending or
 * just cancel. They're not silently dropped so the caller can warn.
 */
export async function fetchUrgentOrderEmailGroups(
  orderIds: string[],
): Promise<SendOrderGroupInput[]> {
  if (orderIds.length === 0) return [];

  // Fetch all orders in parallel. Failures degrade gracefully — we
  // can't email a supplier we couldn't load, but we shouldn't block
  // the whole flow on one bad fetch.
  const results = await Promise.allSettled(
    orderIds.map((id) =>
      fetch(`/api/orders/${id}`, { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ),
  );

  type OrderPayload = {
    id: string;
    expectedDeliveryDate: string | null;
    dateOfOrder: string | null;
    itemsDescription: string | null;
    supplier: {
      id: string;
      name: string;
      contactName: string | null;
      contactEmail: string | null;
      accountNumber: string | null;
    };
    job: {
      id: string;
      name: string;
      plot: {
        name: string;
        plotNumber: string | null;
        site: {
          id: string;
          name: string;
          address: string | null;
          postcode: string | null;
        };
      };
    };
    orderItems: Array<{
      name: string;
      quantity: number;
      unit: string;
      unitCost: number;
    }>;
  };
  const fetched = results
    .filter((r): r is PromiseFulfilledResult<OrderPayload> => r.status === "fulfilled")
    .map((r) => r.value);

  // Group by supplier id so each supplier gets one combined email.
  const bySupplier = new Map<string, SendOrderGroupInput>();
  for (const o of fetched) {
    const key = o.supplier.id;
    const existing = bySupplier.get(key);
    const orderEntry = {
      id: o.id,
      job: {
        id: o.job.id,
        name: o.job.name,
        plot: {
          name: o.job.plot.name,
          plotNumber: o.job.plot.plotNumber,
          site: {
            id: o.job.plot.site.id,
            name: o.job.plot.site.name,
            address: o.job.plot.site.address,
            postcode: o.job.plot.site.postcode,
          },
        },
      },
      expectedDeliveryDate: o.expectedDeliveryDate,
      dateOfOrder: o.dateOfOrder,
      itemsDescription: o.itemsDescription,
      items: o.orderItems.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        unitCost: i.unitCost,
      })),
    };
    if (existing) {
      existing.orders.push(orderEntry);
      if (!existing.siteNames.includes(o.job.plot.site.name)) {
        existing.siteNames.push(o.job.plot.site.name);
      }
    } else {
      bySupplier.set(key, {
        supplierId: o.supplier.id,
        supplierName: o.supplier.name,
        contactName: o.supplier.contactName,
        contactEmail: o.supplier.contactEmail,
        accountNumber: o.supplier.accountNumber,
        siteNames: [o.job.plot.site.name],
        orders: [orderEntry],
        urgent: true,
        skipStatusUpdate: true,
      });
    }
  }

  return Array.from(bySupplier.values());
}
