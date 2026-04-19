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

// ── Input shapes ────────────────────────────────────────────────────────

export interface OrderEmailItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface ChaseOrderInput {
  orderId: string;
  supplierName: string;
  supplierContactName: string | null;
  supplierContactEmail: string | null;
  jobId: string;
  jobName: string;
  plotName: string;
  siteId: string;
  siteName: string;
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
  orders: Array<{
    id: string;
    job: { id: string; name: string; plot: { name: string; site: { id: string; name: string } } };
    expectedDeliveryDate: string | null;
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
  const openChaseOrderEmail = useCallback((o: ChaseOrderInput) => {
    const contactName = o.supplierContactName || o.supplierName;
    const itemsList = o.items.length > 0
      ? o.items.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", ")
      : o.itemsDescription || "materials";
    const expectedDate = o.expectedDeliveryDate
      ? format(new Date(o.expectedDeliveryDate), "dd MMM yyyy")
      : "N/A";
    const days = o.daysOverdue;

    setDraft({
      mode: "chase",
      recipient: o.supplierContactEmail ?? "",
      subject: `Overdue Delivery — Order for ${o.jobName} at ${o.siteName}`,
      body:
        `Hi ${contactName},\n\n` +
        `We are chasing delivery of the following order for ${o.jobName} at ${o.siteName}, ${o.plotName}:\n\n` +
        `Items: ${itemsList}\n\n` +
        `The expected delivery date was ${expectedDate} and the order is now ${days} day${days !== 1 ? "s" : ""} overdue.\n\n` +
        `Please confirm the updated delivery date at your earliest convenience.\n\n` +
        `Regards`,
      eventDescription: `Chased ${o.supplierName} for overdue delivery — ${o.jobName}`,
      eventSiteId: o.siteId,
      eventJobId: o.jobId,
    });
  }, []);

  // ─── Send order (grouped by supplier) ────────────────────────────────
  const openSendOrderEmail = useCallback((group: SendOrderGroupInput) => {
    const contactName = group.contactName || group.supplierName;
    const siteNames = group.siteNames.join(", ");
    const plotNames = [...new Set(group.orders.map((o) => o.job.plot.name))].join(", ");

    // Aggregate items across all orders in the group (sum quantities per name+unit).
    const itemMap = new Map<string, OrderEmailItem>();
    for (const order of group.orders) {
      for (const item of order.items) {
        const key = `${item.name}|||${item.unit}`;
        const existing = itemMap.get(key);
        if (existing) existing.quantity += item.quantity;
        else itemMap.set(key, { ...item });
      }
    }
    const aggregated = Array.from(itemMap.values());
    const itemsList = aggregated.length > 0
      ? aggregated.map((i) => `- ${i.quantity} ${i.unit} ${i.name}`).join("\n")
      : "Materials as discussed";

    // Delivery dates — single, range, or ASAP.
    const deliveryTimes = group.orders
      .filter((o) => o.expectedDeliveryDate)
      .map((o) => new Date(o.expectedDeliveryDate!).getTime());
    const uniqueTimes = [...new Set(deliveryTimes)];
    const deliveryLine = uniqueTimes.length === 0
      ? "Required delivery date: ASAP"
      : uniqueTimes.length === 1
        ? `Required delivery date: ${format(new Date(uniqueTimes[0]), "dd MMM yyyy")}`
        : `Required delivery dates: ${format(new Date(Math.min(...uniqueTimes)), "dd MMM yyyy")} — ${format(new Date(Math.max(...uniqueTimes)), "dd MMM yyyy")}`;

    const firstJob = group.orders[0].job;

    setDraft({
      mode: "send",
      recipient: group.contactEmail ?? "",
      subject: `Material Order — ${siteNames}`,
      body:
        `Hi ${contactName},\n\n` +
        `Please find below our material order covering plots: ${plotNames}.\n\n` +
        `${itemsList}\n\n` +
        `${deliveryLine}\n\n` +
        `Please confirm receipt and expected delivery.\n\n` +
        `Regards`,
      eventDescription: `Sent bulk order to ${group.supplierName} — ${group.orders.length} order(s)`,
      eventSiteId: firstJob.plot.site.id,
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
