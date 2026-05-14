"use client";

/**
 * Order-sent-late prompt — global provider + dialog.
 *
 * When an order is marked sent AFTER its planned send date, the manager
 * has to decide what that does to the schedule. PUT /api/orders/[id]
 * detects the late send server-side and returns `needsLateSendDecision`
 * instead of completing the write; `useOrderStatus` catches that and
 * calls `promptLateSend()` from this provider, then re-PUTs with the
 * chosen impact.
 *
 * One provider, mounted once in the root layout — so EVERY surface that
 * marks an order sent (Orders page, plot to-do list, walkthrough, job
 * panels, the email composer) gets the popup with zero per-screen work.
 *
 * Bulk sends collect every late order into ONE combined dialog: the
 * manager picks a single choice + reason that applies to all of them.
 * PUSH_PLOT / CHANGE_DELIVERY shift each order by ITS OWN lateness;
 * KEEP / NO_IMPACT move nothing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { addWorkingDays } from "@/lib/working-days";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

/** One late-sent order needing a decision — shape of the server's
 *  `needsLateSendDecision` payload. */
export interface LateSendItem {
  orderId: string;
  /** ISO — the order's planned send date (`dateOfOrder`). */
  plannedSendDate: string;
  /** How many working days after the planned date it's being sent. */
  lateWorkingDays: number;
  /** ISO — the order's current expected delivery date, if any. */
  currentDeliveryDate: string | null;
  leadTimeDays: number | null;
  jobName: string | null;
  plotName: string | null;
  plotNumber: string | null;
  supplierName: string;
  itemsDescription: string | null;
}

export type LateSendChoice =
  | "CHANGE_DELIVERY"
  | "PUSH_PLOT"
  | "KEEP"
  | "NO_IMPACT";

/** The manager's decision — sent back as `body.lateSend` on the re-PUT. */
export interface LateSendDecision {
  choice: LateSendChoice;
  /** Manual delivery date (CHANGE_DELIVERY, single-order only). */
  newDeliveryDate?: string;
  /** Picked reason from the ORDER_SEND DelayReason list. */
  delayReasonId?: string;
  /** Custom "Other" reason text — server upserts it into the list. */
  delayReasonLabel?: string;
  /** Optional free-text note. */
  note?: string;
}

interface DelayReasonChip {
  id: string;
  label: string;
  scope: string | null;
  isSystem: boolean;
  usageCount: number;
}

// ── Context ──────────────────────────────────────────────────────────

interface LateSendPromptContextValue {
  /**
   * Show the popup for one or more late orders. Resolves with a map of
   * orderId → decision (the SAME decision for every order — Keith's
   * "one combined prompt"), or null if the manager cancelled.
   */
  promptLateSend: (
    items: LateSendItem[],
  ) => Promise<Record<string, LateSendDecision> | null>;
}

const LateSendPromptContext =
  createContext<LateSendPromptContextValue | null>(null);

export function useLateSendPrompt(): LateSendPromptContextValue {
  const ctx = useContext(LateSendPromptContext);
  if (!ctx) {
    // Defensive: a caller somehow outside the provider degrades to
    // "no decision" rather than crashing — the order just isn't sent.
    return { promptLateSend: async () => null };
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────

export function LateSendPromptProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    items: LateSendItem[];
    resolve: (v: Record<string, LateSendDecision> | null) => void;
  } | null>(null);

  const promptLateSend = useCallback(
    (items: LateSendItem[]) =>
      new Promise<Record<string, LateSendDecision> | null>((resolve) => {
        if (items.length === 0) {
          resolve({});
          return;
        }
        setPending({ items, resolve });
      }),
    [],
  );

  const handleSubmit = useCallback(
    (decisions: Record<string, LateSendDecision>) => {
      pending?.resolve(decisions);
      setPending(null);
    },
    [pending],
  );

  const handleCancel = useCallback(() => {
    pending?.resolve(null);
    setPending(null);
  }, [pending]);

  return (
    <LateSendPromptContext.Provider value={{ promptLateSend }}>
      {children}
      {pending && (
        <LateSendDialog
          items={pending.items}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}
    </LateSendPromptContext.Provider>
  );
}

// ── Choice metadata ──────────────────────────────────────────────────

const CHOICES: Array<{
  value: LateSendChoice;
  icon: typeof CalendarClock;
  title: string;
  /** Description — `n` is the lateness in working days (single order)
   *  or null (bulk: each order has its own). */
  describe: (n: number | null) => string;
  accent: string;
}> = [
  {
    value: "PUSH_PLOT",
    icon: CalendarClock,
    title: "Change delivery date & push the plot back",
    describe: (n) =>
      n === null
        ? "Each delivery and its dependent job slip by that order's own lateness — everything after cascades."
        : `Delivery and the dependent job both slip by ${n} working day${n === 1 ? "" : "s"} — everything after it cascades.`,
    accent: "border-amber-400 bg-amber-50 text-amber-900",
  },
  {
    value: "CHANGE_DELIVERY",
    icon: CalendarX,
    title: "Change delivery date only",
    describe: (n) =>
      n === null
        ? "Move each delivery back by that order's lateness. The plot schedules don't move."
        : "Set the supplier's new delivery date. The order moves; the plot schedule doesn't.",
    accent: "border-sky-400 bg-sky-50 text-sky-900",
  },
  {
    value: "KEEP",
    icon: Clock,
    title: "Keep original delivery date",
    describe: () =>
      "Nothing moves — you're absorbing the slip. Still logged as an internal delay for the record.",
    accent: "border-slate-400 bg-slate-50 text-slate-900",
  },
  {
    value: "NO_IMPACT",
    icon: CheckCircle2,
    title: "Wasn't needed that early — no programme impact",
    describe: () =>
      "Nothing moves. Logged for the audit trail but kept out of the Delay Report's headline counts.",
    accent: "border-emerald-400 bg-emerald-50 text-emerald-900",
  },
];

// ── Dialog ───────────────────────────────────────────────────────────

function LateSendDialog({
  items,
  onSubmit,
  onCancel,
}: {
  items: LateSendItem[];
  onSubmit: (decisions: Record<string, LateSendDecision>) => void;
  onCancel: () => void;
}) {
  const isBulk = items.length > 1;
  const single = items[0];

  // Default to PUSH_PLOT — keeping the original date is rarely right
  // when you're already late (Keith's steer).
  const [choice, setChoice] = useState<LateSendChoice>("PUSH_PLOT");
  const [newDeliveryDate, setNewDeliveryDate] = useState("");
  const [chips, setChips] = useState<DelayReasonChip[]>([]);
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ORDER_SEND reason chips — seeded list plus anything previous custom
  // entries have added (Keith's "Other gets added to the base list").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/delay-reasons?scope=ORDER_SEND", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as DelayReasonChip[];
        if (!cancelled) setChips(data);
      } catch {
        /* non-critical — manager can still type a custom reason */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fill the manual delivery date (single order) to "old delivery +
  // lateness" — a sensible default the manager can override.
  useEffect(() => {
    if (isBulk || !single?.currentDeliveryDate) return;
    const suggested = addWorkingDays(
      new Date(single.currentDeliveryDate),
      single.lateWorkingDays,
    );
    setNewDeliveryDate(format(suggested, "yyyy-MM-dd"));
  }, [isBulk, single]);

  // Reason is required — Keith: "for reporting there needs to be reasons
  // given for the order being late".
  const hasReason = !!selectedChipId || customLabel.trim().length > 0;

  function submit() {
    if (!hasReason || submitting) return;
    const decision: LateSendDecision = { choice };
    if (selectedChipId) decision.delayReasonId = selectedChipId;
    else if (customLabel.trim()) decision.delayReasonLabel = customLabel.trim();
    if (note.trim()) decision.note = note.trim();
    if (choice === "CHANGE_DELIVERY" && !isBulk && newDeliveryDate) {
      decision.newDeliveryDate = newDeliveryDate;
    }
    setSubmitting(true);
    const map: Record<string, LateSendDecision> = {};
    for (const it of items) map[it.orderId] = decision;
    onSubmit(map);
  }

  const orderLabel = (it: LateSendItem) => {
    const plot = it.plotNumber
      ? `Plot ${it.plotNumber}`
      : it.plotName ?? null;
    const bits = [it.supplierName, it.itemsDescription, it.jobName, plot].filter(
      Boolean,
    );
    return bits.join(" · ");
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !submitting) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600" />
            {isBulk ? `${items.length} orders sent late` : "Order sent late"}
          </DialogTitle>
          <DialogDescription>
            {isBulk ? (
              <>
                These orders are going out after their planned send dates.
                Pick what that does to the schedule — it applies to all of
                them.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {orderLabel(single)}
                </span>{" "}
                — going out{" "}
                <strong>
                  {single.lateWorkingDays} working day
                  {single.lateWorkingDays === 1 ? "" : "s"}
                </strong>{" "}
                after its planned send date of{" "}
                <strong>
                  {format(new Date(single.plannedSendDate), "EEE d MMM")}
                </strong>
                .
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Bulk: list the late orders so the manager sees what's covered. */}
          {isBulk && (
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border bg-slate-50/60 p-2">
              {items.map((it) => (
                <div
                  key={it.orderId}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate text-muted-foreground">
                    {orderLabel(it)}
                  </span>
                  <span className="shrink-0 font-medium text-amber-700">
                    {it.lateWorkingDays} WD late
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* The four choices. */}
          <div className="space-y-1.5">
            {CHOICES.map((c) => {
              const selected = choice === c.value;
              const Icon = c.icon;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChoice(c.value)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                    selected
                      ? c.accent
                      : "border-border bg-white hover:bg-slate-50",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      selected ? "" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">
                      {c.title}
                    </span>
                    <span
                      className={cn(
                        "block text-[11px]",
                        selected ? "opacity-80" : "text-muted-foreground",
                      )}
                    >
                      {c.describe(isBulk ? null : single.lateWorkingDays)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* CHANGE_DELIVERY (single order) — manual delivery date. */}
          {choice === "CHANGE_DELIVERY" && !isBulk && (
            <div className="rounded-md border bg-sky-50/50 p-2.5">
              <Label
                htmlFor="late-send-delivery"
                className="text-xs font-medium"
              >
                New delivery date
              </Label>
              {single.currentDeliveryDate && (
                <p className="mb-1 mt-0.5 text-[11px] text-muted-foreground">
                  Currently expected{" "}
                  <span className="font-medium text-foreground">
                    {format(
                      new Date(single.currentDeliveryDate),
                      "EEE d MMM yyyy",
                    )}
                  </span>
                </p>
              )}
              <Input
                id="late-send-delivery"
                type="date"
                value={newDeliveryDate}
                onChange={(e) => setNewDeliveryDate(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {/* Reason — required, for the Delay Report. Custom entries are
              saved to the ORDER_SEND list for next time. */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Why was it late?{" "}
              <span className="font-normal text-muted-foreground">
                (required — shows on the Delay Report)
              </span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => {
                const selected = selectedChipId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedChipId(selected ? null : c.id);
                      if (!selected) setCustomLabel("");
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      selected
                        ? "border-amber-400 bg-amber-50 text-amber-900"
                        : "border-border bg-white text-muted-foreground hover:bg-slate-50",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
              {chips.length === 0 && (
                <span className="text-xs italic text-muted-foreground">
                  Loading reasons…
                </span>
              )}
            </div>
            <Input
              value={customLabel}
              onChange={(e) => {
                setCustomLabel(e.target.value);
                if (e.target.value && selectedChipId) setSelectedChipId(null);
              }}
              placeholder="Or type your own — saved for next time"
              maxLength={80}
            />
          </div>

          {/* Optional note. */}
          <div className="space-y-1.5">
            <Label htmlFor="late-send-note" className="text-xs font-medium">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="late-send-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth recording alongside this"
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!hasReason || submitting}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {isBulk ? `Send ${items.length} orders` : "Send order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
