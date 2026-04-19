"use client";

/**
 * Shared order-email dialog — single source of truth for the two main
 * supplier email flows:
 *   - openSendOrderEmail(group)    → "Material Order" + marks orders as ORDERED
 *   - openChaseOrderEmail(order)   → "Overdue Delivery" chase, no status change
 *
 * Before: TasksClient (and similar code in DailyBrief / OrderDetailSheet)
 * had their own editable-subject/body dialogs with slightly different
 * templates, mailto construction, and event-logging. Copy drifted,
 * status-change-on-send behaviour inconsistent.
 *
 * Now: one hook, one dialog. Caller picks the flow; the hook handles
 * the template, mailto, event log, and optional status change.
 * Subject + body are still user-editable before send (they always were).
 *
 * Keith's construction context: email is the primary supplier comms
 * channel. Templates must stay professional and match the phrasing
 * Keith already uses — any change here is user-visible.
 */

import { useCallback, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Loader2, Mail, Send } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpTip } from "@/components/shared/HelpTip";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { buildOrderEmailBody } from "@/lib/order-email";

// ── Input shapes ────────────────────────────────────────────────────────

export interface OrderEmailItem {
  name: string;
  quantity: number;
  unit: string;
  /** Optional — only included if we know it. Rich template uses it
   *  for per-line totals. Missing = rendered as "-" in the table. */
  unitCost?: number;
}

export interface ChaseOrderInput {
  orderId: string;
  supplierName: string;
  supplierContactName: string | null;
  supplierContactEmail: string | null;
  supplierAccountNumber?: string | null;
  jobId: string;
  jobName: string;
  plotName: string;
  plotNumber?: string | null;
  siteId: string;
  siteName: string;
  siteAddress?: string | null;
  sitePostcode?: string | null;
  itemsDescription: string | null;
  items: OrderEmailItem[];
  expectedDeliveryDate: string | null;
  daysOverdue: number;
}

export interface SendOrderGroupInput {
  supplierId: string;
  supplierName: string;
  contactName: string | null;
  contactEmail: string | null;
  accountNumber?: string | null;
  orders: Array<{
    id: string;
    job: {
      id: string;
      name: string;
      plot: {
        name: string;
        plotNumber?: string | null;
        site: { id: string; name: string; address?: string | null; postcode?: string | null };
      };
    };
    expectedDeliveryDate: string | null;
    dateOfOrder?: string | null;
    itemsDescription?: string | null;
    items: OrderEmailItem[];
  }>;
  /** Unique site names covered by the orders in this group. */
  siteNames: string[];
}

// ── Hook ────────────────────────────────────────────────────────────────

type Mode = "send" | "chase";

interface DraftState {
  mode: Mode;
  subject: string;
  body: string;
  recipient: string;
  eventDescription: string;
  eventSiteId: string;
  eventJobId: string;
  /** For send mode — order ids to mark as ORDERED after send. */
  orderIdsToMark?: string[];
}

interface Result {
  openSendOrderEmail: (group: SendOrderGroupInput) => void;
  openChaseOrderEmail: (order: ChaseOrderInput) => void;
  isLoading: boolean;
  dialogs: ReactNode;
}

export function useOrderEmail(onSent?: (mode: Mode) => void): Result {
  const toast = useToast();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [sending, setSending] = useState(false);
  const { setManyOrderStatus } = useOrderStatus({ silent: true });

  // ─── Chase (overdue delivery) ────────────────────────────────────────
  // Uses the same rich body builder as send-order so suppliers see a
  // consistent format; the `urgentDelivery` flag adds the ASAP banner at
  // the top plus the "overdue" context.
  const openChaseOrderEmail = useCallback((o: ChaseOrderInput) => {
    const plotLabel = o.plotNumber ? `Plot ${o.plotNumber}` : o.plotName;
    const days = o.daysOverdue;
    const expectedDate = o.expectedDeliveryDate
      ? format(new Date(o.expectedDeliveryDate), "dd MMM yyyy")
      : "N/A";

    // Build the shared rich body then prepend the chase context.
    const richBody = buildOrderEmailBody({
      supplierName: o.supplierName,
      supplierContactName: o.supplierContactName,
      supplierAccountNumber: o.supplierAccountNumber ?? null,
      jobName: o.jobName,
      siteName: o.siteName,
      siteAddress: o.siteAddress ?? null,
      sitePostcode: o.sitePostcode ?? null,
      plotNumbers: [plotLabel],
      items: o.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        unitCost: i.unitCost ?? 0,
      })),
      itemsDescriptionFallback: o.itemsDescription,
      expectedDeliveryDate: o.expectedDeliveryDate,
      urgentDelivery: true,
    });
    // Inject the overdue context just after the greeting (first blank line).
    const chaseNote = `This order was due on ${expectedDate} and is now ${days} day${days !== 1 ? "s" : ""} overdue. Please confirm the updated delivery date at your earliest convenience.`;
    const lines = richBody.split("\n");
    // Insert after the greeting (line 0) and its blank line (line 1)
    const body = [...lines.slice(0, 2), chaseNote, ...lines.slice(2)].join("\n");

    setDraft({
      mode: "chase",
      recipient: o.supplierContactEmail ?? "",
      subject: `Overdue Delivery — ${o.jobName} — ${o.siteName}`,
      body,
      eventDescription: `Chased ${o.supplierName} for overdue delivery — ${o.jobName}`,
      eventSiteId: o.siteId,
      eventJobId: o.jobId,
    });
  }, []);

  // ─── Send order (grouped by supplier) ────────────────────────────────
  // Delegates to the shared buildOrderEmailBody in src/lib/order-email.ts
  // — same rich format as Daily Brief and OrderDetailSheet, so suppliers
  // see one consistent professional template no matter which screen
  // Keith sends from.
  const openSendOrderEmail = useCallback((group: SendOrderGroupInput) => {
    // Aggregate items across all orders in the group.
    const itemMap = new Map<string, OrderEmailItem>();
    for (const order of group.orders) {
      for (const item of order.items) {
        const key = `${item.name}|||${item.unit}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          itemMap.set(key, { ...item });
        }
      }
    }
    const aggregated = Array.from(itemMap.values());

    const firstOrder = group.orders[0];
    const firstJob = firstOrder.job;
    const firstSite = firstJob.plot.site;
    const plotLabels = [...new Set(
      group.orders.map((o) => o.job.plot.plotNumber
        ? `Plot ${o.job.plot.plotNumber}`
        : o.job.plot.name)
    )];

    // Pick the earliest delivery date across the group (or null).
    const deliveryTimes = group.orders
      .filter((o) => o.expectedDeliveryDate)
      .map((o) => new Date(o.expectedDeliveryDate!).getTime());
    const earliestDelivery = deliveryTimes.length > 0
      ? new Date(Math.min(...deliveryTimes)).toISOString()
      : null;
    // Items-description fallback — use the first order's description when
    // there are no structured items but a description exists.
    const firstWithDescription = group.orders.find((o) => !!o.itemsDescription);

    const body = buildOrderEmailBody({
      supplierName: group.supplierName,
      supplierContactName: group.contactName,
      supplierAccountNumber: group.accountNumber ?? null,
      jobName: firstJob.name,
      siteName: firstSite.name,
      siteAddress: firstSite.address ?? null,
      sitePostcode: firstSite.postcode ?? null,
      plotNumbers: plotLabels,
      items: aggregated.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        unitCost: i.unitCost ?? 0,
      })),
      itemsDescriptionFallback: firstWithDescription?.itemsDescription ?? null,
      expectedDeliveryDate: earliestDelivery,
      orderDate: firstOrder.dateOfOrder ?? null,
    });

    const plotCount = plotLabels.length;
    const subject = `Material Order — ${firstJob.name} — ${firstSite.name}${plotCount > 1 ? ` (${plotCount} plots)` : ""}`;

    setDraft({
      mode: "send",
      recipient: group.contactEmail ?? "",
      subject,
      body,
      eventDescription: `Sent bulk order to ${group.supplierName} — ${group.orders.length} order(s)`,
      eventSiteId: firstSite.id,
      eventJobId: firstJob.id,
      orderIdsToMark: group.orders.map((o) => o.id),
    });
  }, []);

  const close = useCallback(() => setDraft(null), []);

  async function sendNow() {
    if (!draft) return;
    setSending(true);
    try {
      // Open the user's mail client. We can't "send" on their behalf
      // — that's the whole point of mailto, user owns the outbound.
      const mailto = `mailto:${encodeURIComponent(draft.recipient)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
      window.open(mailto, "_blank");

      // Log event (fire-and-forget — email opening is the user signal that
      // counts; server-side event is audit breadcrumb).
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "USER_ACTION",
          description: draft.eventDescription,
          siteId: draft.eventSiteId,
          jobId: draft.eventJobId,
        }),
      }).catch(() => {});

      // For send-order mode: mark all the listed orders as ORDERED so
      // they clear from the "needs to be sent" task bucket.
      if (draft.mode === "send" && draft.orderIdsToMark?.length) {
        await setManyOrderStatus(draft.orderIdsToMark, "ORDERED");
      }

      toast.success(
        draft.mode === "chase"
          ? "Chase email opened in your mail client"
          : `Order email opened — ${draft.orderIdsToMark?.length ?? 0} order${draft.orderIdsToMark?.length === 1 ? "" : "s"} marked as sent`
      );
      const sentMode = draft.mode;
      close();
      onSent?.(sentMode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open email");
    } finally {
      setSending(false);
    }
  }

  const title = draft?.mode === "chase" ? "Chase Overdue Delivery" : "Send Order to Supplier";

  const dialogs = (
    <Dialog open={!!draft} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <HelpTip title="About supplier email" anchor="below-left">
          <p><strong>How it works:</strong> clicking Send opens your default mail client with the message pre-filled. You review / edit there and hit Send in your mail client.</p>
          <p><strong>Why not send directly?</strong> Your mail client keeps the sent record in your usual Sent folder and uses your signature. Easier to audit later.</p>
          <p><strong>Order status:</strong> when sending a new order, the orders get marked <strong>ORDERED</strong> automatically so they clear from the Tasks list. Chasing doesn&apos;t change status.</p>
          <p><strong>Template:</strong> edit the subject or body before sending if you want — the template is a starting point, not a lock.</p>
        </HelpTip>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Opens in your mail client for final review before sending.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="email"
              value={draft?.recipient ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, recipient: e.target.value } : d))}
              placeholder="supplier@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input
              value={draft?.subject ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, subject: e.target.value } : d))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              value={draft?.body ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))}
              rows={10}
              className="mt-1 font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
          <Button size="sm" onClick={sendNow} disabled={sending || !draft?.recipient.trim()}>
            {sending ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Send className="size-3.5 mr-1" />}
            {draft?.mode === "chase" ? "Open Chase Email" : "Open & Mark Sent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openSendOrderEmail, openChaseOrderEmail, isLoading: sending, dialogs };
}
