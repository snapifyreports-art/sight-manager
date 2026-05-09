"use client";

import { useMemo, useState } from "react";
import { Package, Truck } from "lucide-react";
import type {
  TemplateData,
  TemplateJobData,
  TemplateOrderData,
} from "./types";

/**
 * Horizontal strip showing every order's computed order-week +
 * delivery-week against the same week scale as the Gantt above.
 * Read-only — the editor's existing dialogs are still where users
 * change anchor / lead-time settings.
 *
 * The maths mirrors `src/lib/template-order-offsets.ts` so client and
 * server agree; computed here client-side to avoid network round-trips
 * on every render.
 *
 * Why it matters (Keith, May 2026): "1 week BEFORE Joist start" is
 * abstract — easy to end up with four orders landing the same week and
 * a supplier that can't cope. Visualising the schedule makes the
 * collisions obvious before the template ships to a real plot.
 */
export function TemplateOrderTimeline({ template }: { template: TemplateData }) {
  const [hoveringWeek, setHoveringWeek] = useState<number | null>(null);
  const orders = useMemo(() => collectOrdersForRender(template), [template]);
  const totalWeeks = useMemo(() => {
    let max = 0;
    for (const stage of template.jobs) {
      if (stage.endWeek > max) max = stage.endWeek;
    }
    return Math.max(1, max);
  }, [template.jobs]);

  if (orders.length === 0) {
    return null;
  }

  // Bucket by week so collisions are obvious — multiple chips in the
  // same column visually stack.
  const byOrderWeek = new Map<number, RenderableOrder[]>();
  const byDeliveryWeek = new Map<number, RenderableOrder[]>();
  for (const o of orders) {
    if (!byOrderWeek.has(o.orderWeek)) byOrderWeek.set(o.orderWeek, []);
    byOrderWeek.get(o.orderWeek)!.push(o);
    if (!byDeliveryWeek.has(o.deliveryWeek))
      byDeliveryWeek.set(o.deliveryWeek, []);
    byDeliveryWeek.get(o.deliveryWeek)!.push(o);
  }

  const colliding = orders.filter(
    (o) => (byDeliveryWeek.get(o.deliveryWeek)?.length ?? 0) >= 3,
  );

  return (
    <div className="rounded-lg border border-border/60 bg-white">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Truck className="size-3.5 text-blue-600" />
          <span className="font-medium">Order schedule</span>
          <span className="text-muted-foreground">
            ({orders.length} order{orders.length === 1 ? "" : "s"})
          </span>
        </div>
        {colliding.length > 0 && (
          <span className="text-amber-700">
            ⚠ {colliding.length} delivery
            {colliding.length === 1 ? "" : "s"} land in a busy week — supplier
            may struggle
          </span>
        )}
      </div>

      <div className="relative px-3 py-3">
        {/* Week ruler */}
        <div className="relative mb-1 h-4 text-[10px] text-muted-foreground">
          {Array.from({ length: totalWeeks + 1 }, (_, i) => i + 1).map(
            (wk) => (
              <span
                key={wk}
                className="absolute -translate-x-1/2 select-none"
                style={{
                  left: `${((wk - 1) / Math.max(1, totalWeeks)) * 100}%`,
                }}
              >
                {wk % 5 === 1 || wk === 1 || wk === totalWeeks ? `w${wk}` : ""}
              </span>
            ),
          )}
        </div>

        {/* Order row (open) */}
        <Lane
          label="Place"
          icon={<Package className="size-3.5 text-blue-700" />}
          marks={byOrderWeek}
          totalWeeks={totalWeeks}
          tone="order"
          hoveringWeek={hoveringWeek}
          setHoveringWeek={setHoveringWeek}
        />

        {/* Connecting trail — week-N order to week-M delivery */}
        <ConnectorLayer orders={orders} totalWeeks={totalWeeks} />

        {/* Delivery row */}
        <Lane
          label="Arrive"
          icon={<Truck className="size-3.5 text-emerald-700" />}
          marks={byDeliveryWeek}
          totalWeeks={totalWeeks}
          tone="delivery"
          hoveringWeek={hoveringWeek}
          setHoveringWeek={setHoveringWeek}
        />
      </div>
    </div>
  );
}

interface RenderableOrder {
  id: string;
  jobName: string;
  itemsDescription: string;
  orderWeek: number;
  deliveryWeek: number;
}

function collectOrdersForRender(template: TemplateData): RenderableOrder[] {
  const result: RenderableOrder[] = [];
  // Build a flat lookup of all jobs so we can resolve anchorJobId.
  const allJobs = new Map<string, TemplateJobData>();
  function indexJobs(jobs: TemplateJobData[]) {
    for (const j of jobs) {
      allJobs.set(j.id, j);
      if (j.children?.length) indexJobs(j.children);
    }
  }
  indexJobs(template.jobs);

  function visit(job: TemplateJobData) {
    for (const order of job.orders ?? []) {
      const { orderWeek, deliveryWeek } = computeOrderWindow(
        order,
        job,
        allJobs,
      );
      result.push({
        id: order.id,
        jobName: job.name,
        itemsDescription: order.itemsDescription ?? "(no description)",
        orderWeek,
        deliveryWeek,
      });
    }
    for (const child of job.children ?? []) visit(child);
  }
  for (const stage of template.jobs) visit(stage);
  // Stable sort by orderWeek for deterministic rendering
  result.sort((a, b) => a.orderWeek - b.orderWeek || a.deliveryWeek - b.deliveryWeek);
  return result;
}

/**
 * Mirror of `template-order-offsets.deriveOrderOffsets` that runs
 * client-side. Returns absolute weeks (1-indexed against the template's
 * own scale) for both the place-order moment and the on-site arrival.
 */
function computeOrderWindow(
  order: TemplateOrderData,
  ownerJob: TemplateJobData,
  allJobs: Map<string, TemplateJobData>,
): { orderWeek: number; deliveryWeek: number } {
  const refJob = order.anchorJobId
    ? allJobs.get(order.anchorJobId) ?? ownerJob
    : ownerJob;
  const refStart = refJob.startWeek;

  const amountWeeks = unitsToWeeks(order.anchorAmount, order.anchorUnit);
  const leadWeeks = unitsToWeeks(order.leadTimeAmount, order.leadTimeUnit);
  const sign = order.anchorDirection === "after" ? 1 : -1;

  let orderWeek: number;
  let deliveryWeek: number;
  if (!order.anchorType) {
    // Legacy fallback — read the cached offsets directly.
    orderWeek = ownerJob.startWeek + (order.orderWeekOffset ?? -2);
    deliveryWeek = orderWeek + (order.deliveryWeekOffset ?? 0);
  } else if (
    order.anchorType === "order" ||
    order.anchorType === "JOB_START" ||
    order.anchorType === "STAGE_START"
  ) {
    // Anchor fixes the order date; lead time picks delivery.
    orderWeek = refStart + sign * amountWeeks;
    deliveryWeek = orderWeek + leadWeeks;
  } else {
    // "arrive" / JOB_END / STAGE_END — anchor pins delivery; lead time
    // backs out the order date.
    deliveryWeek = refStart + sign * amountWeeks;
    orderWeek = deliveryWeek - leadWeeks;
  }

  return {
    orderWeek: Math.max(1, orderWeek),
    deliveryWeek: Math.max(1, deliveryWeek),
  };
}

function unitsToWeeks(
  amount: number | null | undefined,
  unit: string | null | undefined,
): number {
  const a = amount && amount > 0 ? amount : 0;
  if (a === 0) return 0;
  const u = (unit ?? "").toString().toLowerCase();
  return u === "days" || u === "day" ? Math.round(a / 5) : a;
}

function Lane({
  label,
  icon,
  marks,
  totalWeeks,
  tone,
  hoveringWeek,
  setHoveringWeek,
}: {
  label: string;
  icon: React.ReactNode;
  marks: Map<number, RenderableOrder[]>;
  totalWeeks: number;
  tone: "order" | "delivery";
  hoveringWeek: number | null;
  setHoveringWeek: (w: number | null) => void;
}) {
  return (
    <div className="relative my-1.5 flex h-7 items-center">
      <span className="mr-2 flex w-12 shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="relative h-full flex-1 rounded bg-slate-50">
        {Array.from(marks.entries()).map(([wk, list]) => {
          const left = ((wk - 1) / Math.max(1, totalWeeks)) * 100;
          const stack = list.length;
          const colliding = stack >= 3;
          const colour =
            tone === "order"
              ? colliding
                ? "border-blue-500 bg-blue-200 text-blue-900"
                : "border-blue-300 bg-blue-100 text-blue-900"
              : colliding
                ? "border-amber-500 bg-amber-200 text-amber-900"
                : "border-emerald-300 bg-emerald-100 text-emerald-900";
          return (
            <div
              key={wk}
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: `${left}%` }}
              onMouseEnter={() => setHoveringWeek(wk)}
              onMouseLeave={() => setHoveringWeek(null)}
            >
              <div
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${colour}`}
                title={list
                  .map((o) => `${o.jobName} — ${o.itemsDescription}`)
                  .join("\n")}
              >
                w{wk}
                {stack > 1 && <span>·{stack}</span>}
              </div>
              {hoveringWeek === wk && list.length > 0 && (
                <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 max-w-[260px] rounded-md border bg-white p-2 text-[11px] shadow-md">
                  {list.map((o) => (
                    <p key={o.id} className="leading-snug">
                      <span className="font-medium">{o.jobName}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {o.itemsDescription}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConnectorLayer({
  orders,
  totalWeeks,
}: {
  orders: RenderableOrder[];
  totalWeeks: number;
}) {
  return (
    <div className="relative my-1 h-2">
      <div className="absolute inset-x-12 inset-y-0">
        <svg
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          {orders.map((o) => {
            const x1 = ((o.orderWeek - 1) / Math.max(1, totalWeeks)) * 100;
            const x2 = ((o.deliveryWeek - 1) / Math.max(1, totalWeeks)) * 100;
            return (
              <line
                key={o.id}
                x1={`${x1}%`}
                y1="0%"
                x2={`${x2}%`}
                y2="100%"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 2"
                className="text-blue-300"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
