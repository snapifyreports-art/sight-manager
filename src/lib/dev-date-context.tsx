"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { DEV_DATE_COOKIE } from "@/lib/dev-date";

interface DevDateContextValue {
  /** The overridden date string (ISO), or null if dev mode is off */
  devDate: string | null;
  /** Whether dev mode is currently active */
  isDevMode: boolean;
  /** Set a new override date (ISO string) or null to disable */
  setDevDate: (date: string | null) => void;
}

const DevDateContext = createContext<DevDateContextValue>({
  devDate: null,
  isDevMode: false,
  setDevDate: () => {},
});

/** Read the dev-date-override cookie value */
function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${DEV_DATE_COOKIE}=([^;]*)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// Notify subscribers when the dev-date cookie is updated programmatically.
// The browser doesn't fire an event when document.cookie changes, so we
// dispatch a custom event ourselves and let useSyncExternalStore pick it up.
const DEV_DATE_EVENT = "dev-date-changed";

function subscribeToDevDate(callback: () => void) {
  window.addEventListener(DEV_DATE_EVENT, callback);
  return () => window.removeEventListener(DEV_DATE_EVENT, callback);
}

function getDevDateServerSnapshot(): string | null {
  return null;
}

export function DevDateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Reading the cookie is deterministic per the snapshot callback — React 19
  // will cache snapshots within a render so useSyncExternalStore is safe here.
  const devDate = useSyncExternalStore(subscribeToDevDate, readCookie, getDevDateServerSnapshot);

  const setDevDate = useCallback(
    (date: string | null) => {
      if (date) {
        document.cookie = `${DEV_DATE_COOKIE}=${encodeURIComponent(date)}; path=/; SameSite=Lax`;
      } else {
        document.cookie = `${DEV_DATE_COOKIE}=; path=/; max-age=0`;
      }
      // Notify listeners (including our own useSyncExternalStore)
      window.dispatchEvent(new Event(DEV_DATE_EVENT));
      // Refresh server components + API data
      router.refresh();
    },
    [router]
  );

  return (
    <DevDateContext.Provider
      value={{ devDate, isDevMode: devDate !== null, setDevDate }}
    >
      {children}
    </DevDateContext.Provider>
  );
}

export function useDevDate() {
  return useContext(DevDateContext);
}
