"use client";

import { useState, useCallback, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Replacement for `window.confirm()` — same shape, same return type
 * (Promise<boolean>), but renders the design-system Dialog so it's
 * stylable, accessible, and not silently dismissed by keyboard Enter.
 *
 * Pre-May 2026 the codebase had 15 `window.confirm()` callsites for
 * destructive actions like "delete this update", "rotate share link",
 * "delete snag" — all of them ugly browser-default dialogs that
 * couldn't be styled and looked alien. This hook is the single source
 * of truth.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   const ok = await confirm({
 *     title: "Delete this update?",
 *     body: "It will disappear from the customer page.",
 *     danger: true,
 *   });
 *   if (!ok) return;
 *   ...
 *   {dialog}
 */

interface ConfirmOptions {
  title: string;
  /** Optional supporting body. Can be a string or rich JSX. */
  body?: ReactNode;
  /** Confirm-button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel-button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** When true, the confirm button styles as destructive (red). */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      if (pending) {
        pending.resolve(ok);
        setPending(null);
      }
    },
    [pending],
  );

  const dialog = (
    <Dialog
      open={!!pending}
      onOpenChange={(o) => {
        if (!o) close(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pending?.danger && (
              <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
            )}
            {pending?.title}
          </DialogTitle>
          {pending?.body && (
            <DialogDescription className="text-sm text-slate-600">
              {pending.body}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            {pending?.cancelLabel ?? "Cancel"}
          </DialogClose>
          <Button
            size="sm"
            variant={pending?.danger ? "destructive" : "default"}
            onClick={() => close(true)}
            autoFocus
          >
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
