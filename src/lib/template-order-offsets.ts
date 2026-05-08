/**
 * Server-side derivation of TemplateOrder.orderWeekOffset /
 * deliveryWeekOffset from the user-facing anchor fields.
 *
 * Background — May 2026 SSOT rework:
 *
 *   - Anchor fields (anchorType, anchorAmount, anchorUnit, anchorDirection,
 *     anchorJobId, leadTimeAmount, leadTimeUnit) are the **canonical**
 *     description of an order's timing. They're what the editor saves and
 *     what apply-template-helpers.resolveOrderDates reads at apply time.
 *   - Legacy `orderWeekOffset` and `deliveryWeekOffset` are kept on the
 *     model as a derived cache so old API consumers and the
 *     TemplateTimeline still see something meaningful. They are rederived
 *     on every order POST/PUT from the anchor fields here, so the cache
 *     can never drift from the canonical fields.
 *
 * If the caller didn't pass anchor fields (legacy templates, old clients)
 * we honour the offsets they DID pass — we never overwrite a legacy order
 * with a zero-derived value.
 */

import type { PrismaClient } from "@prisma/client";

export interface DeriveOffsetsInput {
  ownerJobId: string;
  anchorType?: "order" | "arrive" | string | null;
  anchorAmount?: number | null;
  anchorUnit?: "weeks" | "days" | string | null;
  anchorDirection?: "before" | "after" | string | null;
  anchorJobId?: string | null;
  leadTimeAmount?: number | null;
  leadTimeUnit?: "weeks" | "days" | string | null;
  /** Used when anchor fields aren't present (legacy clients). */
  fallbackOrderWeekOffset?: number | null;
  fallbackDeliveryWeekOffset?: number | null;
}

export interface DerivedOffsets {
  orderWeekOffset: number;
  deliveryWeekOffset: number;
}

const DEFAULT_ORDER_OFFSET = -2;
const DEFAULT_DELIVERY_OFFSET = 0;

/**
 * Derive (orderWeekOffset, deliveryWeekOffset) from anchor fields. The
 * computation mirrors the editor's `computeOffsets` helper but lives
 * server-side so saves are always consistent regardless of which client
 * (web app, future mobile, scripted import) wrote them.
 *
 * Anchor amount/unit are converted to whole WEEKS (rounded) because the
 * legacy offsets are stored in week units. Day-resolution lives only on
 * the anchor fields.
 */
export async function deriveOrderOffsets(
  prisma: PrismaClient,
  input: DeriveOffsetsInput,
): Promise<DerivedOffsets> {
  // No anchor info → fall back to whatever the client sent, then sensible
  // defaults. Lets legacy POST bodies (offsets only) keep working.
  if (!input.anchorType) {
    return {
      orderWeekOffset:
        input.fallbackOrderWeekOffset ?? DEFAULT_ORDER_OFFSET,
      deliveryWeekOffset:
        input.fallbackDeliveryWeekOffset ?? DEFAULT_DELIVERY_OFFSET,
    };
  }

  const ownerJob = await prisma.templateJob.findUnique({
    where: { id: input.ownerJobId },
    select: { startWeek: true },
  });
  if (!ownerJob) {
    return {
      orderWeekOffset:
        input.fallbackOrderWeekOffset ?? DEFAULT_ORDER_OFFSET,
      deliveryWeekOffset:
        input.fallbackDeliveryWeekOffset ?? DEFAULT_DELIVERY_OFFSET,
    };
  }

  // Anchor reference job: explicit if anchorJobId, otherwise the order's
  // own owner. Same default the editor uses.
  let refStartWeek = ownerJob.startWeek;
  if (input.anchorJobId) {
    const ref = await prisma.templateJob.findUnique({
      where: { id: input.anchorJobId },
      select: { startWeek: true },
    });
    if (ref) refStartWeek = ref.startWeek;
  }

  const amountInWeeks = unitsToWeeks(input.anchorAmount, input.anchorUnit);
  const leadInWeeks = unitsToWeeks(input.leadTimeAmount, input.leadTimeUnit);
  const sign = input.anchorDirection === "after" ? 1 : -1;

  let orderWeek: number;
  let deliveryWeek: number;
  if (input.anchorType === "order") {
    orderWeek = refStartWeek + sign * amountInWeeks;
    deliveryWeek = orderWeek + leadInWeeks;
  } else {
    // "arrive" — anchor pins the delivery, lead time picks the order date.
    deliveryWeek = refStartWeek + sign * amountInWeeks;
    orderWeek = deliveryWeek - leadInWeeks;
  }

  return {
    orderWeekOffset: orderWeek - ownerJob.startWeek,
    deliveryWeekOffset: deliveryWeek - orderWeek,
  };
}

/**
 * Convert a (amount, unit) into weeks. Days get rounded to the nearest
 * whole week — the legacy offsets are integer week values so we can't
 * preserve sub-week resolution here. That's fine: anchor fields keep the
 * exact value, and apply-template-helpers reads the anchor fields, not
 * these offsets, so no resolution is lost.
 */
function unitsToWeeks(
  amount: number | null | undefined,
  unit: string | null | undefined,
): number {
  const a = amount && amount > 0 ? amount : 0;
  if (a === 0) return 0;
  return unit === "days" ? Math.round(a / 5) : a;
}
