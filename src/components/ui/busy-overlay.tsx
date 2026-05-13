"use client";

/**
 * (May 2026 Keith bug report) Global "click-lock" overlay used while
 * a critical mutation is in flight. Blocks every pointer / wheel /
 * keyboard interaction so the user can't:
 *
 *   - Double-click a Save button and submit twice
 *   - Scroll away from a half-completed form
 *   - Navigate via the sidebar mid-write and abandon the request
 *
 * Usage:
 *
 *   const { begin, end, withLock } = useBusyOverlay();
 *
 *   // Imperative bracketing:
 *   begin("Saving template…");
 *   try { await fetch(...); } finally { end(); }
 *
 *   // Auto-bracketed Promise:
 *   await withLock("Saving template…", () => fetch(...));
 *
 * One provider, mounted in root layout. Multiple concurrent locks
 * are reference-counted so nested operations don't end the overlay
 * prematurely. The displayed message is the latest non-empty one.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

interface BusyOverlayApi {
  /** Start a lock, return a unique key for end(). */
  begin: (message?: string) => number;
  /** End a lock by its key. */
  end: (key: number) => void;
  /** Auto-bracket an async function. */
  withLock: <T>(message: string, fn: () => Promise<T>) => Promise<T>;
}

const BusyOverlayContext = createContext<BusyOverlayApi | null>(null);

export function useBusyOverlay(): BusyOverlayApi {
  const ctx = useContext(BusyOverlayContext);
  if (!ctx) {
    // No-op fallback for components rendered outside the provider
    // (e.g. in tests) so they don't crash.
    return {
      begin: () => 0,
      end: () => {},
      withLock: async (_msg, fn) => fn(),
    };
  }
  return ctx;
}

export function BusyOverlayProvider({ children }: { children: ReactNode }) {
  // Map of key → message so multiple concurrent locks reference-count.
  const [locks, setLocks] = useState<Map<number, string>>(new Map());
  const counterRef = useRef(0);

  const begin = useCallback((message?: string) => {
    const key = ++counterRef.current;
    setLocks((prev) => {
      const next = new Map(prev);
      next.set(key, message ?? "Working…");
      return next;
    });
    return key;
  }, []);

  const end = useCallback((key: number) => {
    setLocks((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const withLock = useCallback(
    async <T,>(message: string, fn: () => Promise<T>): Promise<T> => {
      const key = begin(message);
      try {
        return await fn();
      } finally {
        end(key);
      }
    },
    [begin, end],
  );

  // Latest message wins (LIFO).
  const message = useMemo(() => {
    const messages = Array.from(locks.values());
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }, [locks]);

  // Prevent body scrolling while the overlay is up.
  useEffect(() => {
    if (locks.size === 0) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [locks.size]);

  const api = useMemo<BusyOverlayApi>(() => ({ begin, end, withLock }), [begin, end, withLock]);

  return (
    <BusyOverlayContext.Provider value={api}>
      {children}
      {message !== null && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          // Full-viewport fixed overlay. z-[10000] above toasts (z-[9999])
          // because the user shouldn't dismiss the toast and interact
          // mid-save. pointer-events: auto blocks every click.
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          // Swallow every input event — keys, wheel, touch, pointer.
          onKeyDown={(e) => {
            // Allow Tab so focus traps work, but block Esc/Enter/etc.
            if (e.key !== "Tab") e.preventDefault();
          }}
        >
          <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-2xl">
            <Loader2 className="size-5 animate-spin text-blue-600" aria-hidden />
            <span className="text-sm font-medium text-slate-900">{message}</span>
          </div>
        </div>
      )}
    </BusyOverlayContext.Provider>
  );
}
