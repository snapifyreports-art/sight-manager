"use client";

import { useSyncExternalStore } from "react";

// Subscribe to nothing — server snapshot returns false (not mounted),
// client snapshot returns true. This is the React 19-recommended way to
// safely defer rendering until after hydration without triggering
// react-hooks/set-state-in-effect.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return mounted ? <>{children}</> : <>{fallback}</>;
}
