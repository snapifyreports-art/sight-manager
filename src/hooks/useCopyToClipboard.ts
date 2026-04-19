"use client";

/**
 * Shared copy-to-clipboard hook with keyed "copied" feedback.
 *
 * Before: four independent implementations scattered across
 * SiteDrawingsClient, PlotDrawingsSection, PlotDetailClient, and
 * ContractorComms. Each with its own useState + setTimeout + minor
 * duration drift (1500ms vs 2000ms) and inconsistent error handling.
 *
 * Now: one hook, same 1800ms feedback window everywhere. Keyed mode
 * supports lists ("which drawing showed Copied?") — pass a stable id
 * as `key`. Single-button mode (no key) also works.
 *
 * Error path surfaces a toast so clipboard-denied contexts don't
 * silently swallow the click.
 */

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";

// Shared duration so every copy button in the app feels the same.
const COPIED_FEEDBACK_MS = 1800;

interface CopyOptions {
  /** Custom toast message on success. Default: none (visual state only). */
  successToast?: string;
}

interface CopyResult {
  /** Copy text. If `key` is passed, `copiedKey` will equal it briefly. */
  copy: (text: string, key?: string, opts?: CopyOptions) => Promise<void>;
  /** True when any copy was recent. Use for the no-key single-button case. */
  copied: boolean;
  /** The keyed id that was most recently copied, or null. For lists. */
  copiedKey: string | null;
}

export function useCopyToClipboard(): CopyResult {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string, key?: string, opts?: CopyOptions) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard API can fail on non-secure contexts or blocked permissions.
        // Keith deploys over HTTPS so this is mostly a user-agent issue.
        toast.error("Couldn't copy — try selecting and copying manually");
        return;
      }
      setCopied(true);
      if (key !== undefined) setCopiedKey(key);
      if (opts?.successToast) toast.success(opts.successToast);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        setCopiedKey(null);
      }, COPIED_FEEDBACK_MS);
    },
    [toast]
  );

  return { copy, copied, copiedKey };
}
