"use client";

/**
 * Lightweight app-wide toast system. One provider mounted at root, every
 * component can `const { toast } = useToast();` and call `toast.error(msg)`
 * or `toast.success(msg)`.
 *
 * Kept minimal on purpose — we don't want a third-party toast lib.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

type ToastType = "error" | "success" | "info";

interface ToastAction {
  /** Button label shown on the toast, e.g. "Review next steps". */
  label: string;
  /** Fired when the user clicks the button. Toast auto-dismisses after. */
  onClick: () => void;
}

interface ToastOptions {
  /** Optional action button. Keep the label short (2-3 words). */
  action?: ToastAction;
  /** Override the default auto-dismiss timeout (ms). */
  ttlMs?: number;
}

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  error: (message: string, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const push = useCallback((type: ToastType, message: string, opts?: ToastOptions) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message, action: opts?.action }]);
    // Auto-dismiss: 5s for success/info, 8s for errors, 10s if there's an
    // action (user needs time to read + decide). Overridable via opts.ttlMs.
    const baseTtl = type === "error" ? 8000 : opts?.action ? 10000 : 5000;
    const ttl = opts?.ttlMs ?? baseTtl;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api: ToastApi = {
    error: (message, opts) => push("error", message, opts),
    success: (message, opts) => push("success", message, opts),
    info: (message, opts) => push("info", message, opts),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Stacked toast viewport — top-right, above everything else.
          (May 2026 a11y audit #122) aria-live="polite" + aria-atomic
          on the container so screen-reader announcements don't
          interleave when two toasts fire close together. */}
      {/* (May 2026 audit UX-P2) Toast viewport positioned bottom-right
          on phones, top-right on tablet+ desktop. Pre-fix the top-right
          position on a 375px phone covered the page title and stacked
          toasts obscured the entire header. `max-sm:bottom-24` keeps
          clear of the floating action button on mobile. */}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 z-[9999] flex max-w-md flex-col gap-2 max-sm:bottom-24 sm:top-4 print:hidden"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  const styles =
    toast.type === "error"
      ? "border-red-300 bg-red-50 text-red-800"
      : toast.type === "success"
        ? "border-green-300 bg-green-50 text-green-800"
        : "border-blue-300 bg-blue-50 text-blue-800";

  const Icon =
    toast.type === "error"
      ? AlertTriangle
      : toast.type === "success"
        ? CheckCircle2
        : AlertTriangle;

  const buttonColor =
    toast.type === "error"
      ? "border-red-400 bg-white text-red-700 hover:bg-red-100"
      : toast.type === "success"
        ? "border-green-400 bg-white text-green-700 hover:bg-green-100"
        : "border-blue-400 bg-white text-blue-700 hover:bg-blue-100";

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${styles}`}
      role={toast.type === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="break-words">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className={`mt-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${buttonColor}`}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mr-1 shrink-0 rounded p-0.5 hover:bg-black/5"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Get the toast API. Must be called inside a component wrapped by
 * ToastProvider (i.e. anything inside the app root layout).
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback — log to console if provider missing (shouldn't
    // happen inside the app, but protects unit tests / storybook).
    return {
      error: (m, _opts) => { console.error("[toast.error]", m); void _opts; },
      success: (m, _opts) => { console.log("[toast.success]", m); void _opts; },
      info: (m, _opts) => { console.log("[toast.info]", m); void _opts; },
    };
  }
  return ctx;
}

/**
 * Helper: extract a user-facing message from a fetch Response. Tries to
 * parse JSON { error } first, falls back to status text.
 */
export async function fetchErrorMessage(res: Response, fallback = "Request failed"): Promise<string> {
  try {
    const data = await res.clone().json();
    if (data && typeof data.error === "string") return data.error;
  } catch {
    /* not json */
  }
  return `${fallback} (HTTP ${res.status})`;
}
