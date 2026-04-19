"use client";

/**
 * Shared confirmation dialog for destructive / irreversible actions.
 *
 * Before: Every module (ContactsClient, SuppliersListClient, UsersClient,
 * SitesClient, etc.) rolled its own Dialog + state + handler for the
 * "Are you sure?" step. Copy drifted and the Delete button sometimes
 * said "Deleting…" and sometimes just disabled without feedback.
 *
 * Now: one hook. `confirmAction({ title, description, onConfirm })`
 * opens the dialog. `onConfirm` is called when the user clicks the
 * destructive button; the hook shows a spinner + disables while the
 * promise resolves. Any thrown error bubbles to a toast.
 *
 * Not just for deletes — suitable for any irreversible confirm
 * ("Cancel order", "Unassign contractor", "Clear all photos").
 */

import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
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

interface ConfirmOptions {
  /** Short dialog title, e.g. "Delete Contractor". */
  title: string;
  /** Body text. Can include React nodes to emphasise the entity name. */
  description: ReactNode;
  /** Label for the destructive button. Default "Delete". */
  confirmLabel?: string;
  /** Button variant; defaults to "destructive". Pass "default" for less-scary confirms. */
  variant?: "destructive" | "default";
  /** Runs when user confirms. Hook auto-closes on resolve; stays open on throw. */
  onConfirm: () => Promise<void> | void;
}

interface Result {
  /** Open the confirm dialog. Returns immediately — the async work runs when user clicks Confirm. */
  confirmAction: (opts: ConfirmOptions) => void;
  /** JSX to render once in the component tree. */
  dialogs: ReactNode;
}

export function useConfirmAction(): Result {
  const toast = useToast();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [running, setRunning] = useState(false);

  const confirmAction = useCallback((o: ConfirmOptions) => {
    setOpts(o);
  }, []);

  const close = useCallback(() => {
    if (!running) setOpts(null);
  }, [running]);

  async function run() {
    if (!opts) return;
    setRunning(true);
    try {
      await opts.onConfirm();
      setOpts(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
      // Keep the dialog open so the user can retry or cancel.
    } finally {
      setRunning(false);
    }
  }

  const variant = opts?.variant ?? "destructive";
  const confirmLabel = opts?.confirmLabel ?? "Delete";

  const dialogs = (
    <Dialog open={!!opts} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={variant === "destructive" ? "size-4 text-red-600" : "size-4 text-amber-600"} />
            {opts?.title}
          </DialogTitle>
          <DialogDescription>{opts?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
          <Button
            variant={variant}
            size="sm"
            onClick={run}
            disabled={running}
          >
            {running ? (
              <><Loader2 className="size-3.5 animate-spin mr-1" />Working…</>
            ) : (
              <>
                {variant === "destructive" && <Trash2 className="size-3.5 mr-1" />}
                {confirmLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmAction, dialogs };
}
