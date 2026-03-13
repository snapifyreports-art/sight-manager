"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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

export function DevDateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [devDate, setDevDateState] = useState<string | null>(null);

  // On mount, read existing cookie
  useEffect(() => {
    setDevDateState(readCookie());
  }, []);

  const setDevDate = useCallback(
    (date: string | null) => {
      if (date) {
        document.cookie = `${DEV_DATE_COOKIE}=${encodeURIComponent(date)}; path=/; SameSite=Lax`;
      } else {
        document.cookie = `${DEV_DATE_COOKIE}=; path=/; max-age=0`;
      }
      setDevDateState(date);
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
