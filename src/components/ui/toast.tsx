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

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const push = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss after 5s for success/info, 8s for errors (more to read)
    const ttl = type === "error" ? 8000 : 5000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const api: ToastApi = {
    error: (message) => push("error", message),
    success: (message) => push("success", message),
    info: (message) => push("info", message),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Stacked toast viewport — top-right, above everything else */}
      <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex max-w-md flex-col gap-2 print:hidden">
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

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${styles}`}
      role={toast.type === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1 break-words">{toast.message}</p>
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
      error: (m) => console.error("[toast.error]", m),
      success: (m) => console.log("[toast.success]", m),
      info: (m) => console.log("[toast.info]", m),
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
