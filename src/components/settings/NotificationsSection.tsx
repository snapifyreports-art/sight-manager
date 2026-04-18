"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  BellOff,
  Smartphone,
  Loader2,
  AlertTriangle,
  Download,
  Share,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { usePush } from "@/lib/use-push";
import { useToast } from "@/components/ui/toast";

// Human-readable labels and descriptions for each notification type
const NOTIFICATION_TYPE_META: Record<
  string,
  { label: string; description: string }
> = {
  JOBS_STARTING_TODAY: {
    label: "Jobs Starting Today",
    description: "Daily summary of jobs with today's start date",
  },
  JOBS_OVERDUE: {
    label: "Overdue Jobs",
    description: "Alert when in-progress jobs pass their end date",
  },
  MATERIALS_OVERDUE: {
    label: "Overdue Materials",
    description: "Alert when orders pass their expected delivery date",
  },
  DELIVERIES_DUE_TODAY: {
    label: "Deliveries Due Today",
    description: "Daily summary of expected deliveries",
  },
  JOBS_READY_FOR_SIGNOFF: {
    label: "Jobs Ready for Sign Off",
    description: "When jobs are approaching or past their end date",
  },
  NEW_NOTES_PHOTOS: {
    label: "New Notes & Photos",
    description: "When someone adds notes or photos to jobs you're on",
  },
  ORDERS_TO_SEND: {
    label: "Orders to Send",
    description: "Reminder about pending orders that need placing",
  },
  NEXT_STAGE_READY: {
    label: "Next Stage Ready",
    description: "When a preceding job is completed and the next stage can begin",
  },
  LATE_STARTS: {
    label: "Late Start Jobs",
    description: "Jobs that have not started but whose scheduled start date has passed",
  },
  WEATHER_ALERT: {
    label: "Weather Alerts",
    description: "When tomorrow's forecast shows rain or frost at a site with weather-sensitive work",
  },
};

interface Preference {
  type: string;
  enabled: boolean;
}

export function NotificationsSection() {
  const { status, subscribe, unsubscribe } = usePush();
  const toast = useToast();
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // PWA Install prompt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (typeof window !== "undefined") {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches
        || ("standalone" in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone);
      setIsInstalled(isStandalone);

      // Detect iOS
      const ua = window.navigator.userAgent;
      setIsIOS(/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document));
    }

    // Listen for the beforeinstallprompt event (Chrome, Edge, Samsung Internet)
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
  }, [installPrompt]);

  // Fetch preferences on mount
  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPreferences(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Toggle a preference and save immediately.
  // Previously this only reverted state on thrown exceptions — if the server
  // returned a non-ok response (e.g. 400/500) the UI would show the toggle
  // as succeeded while the server state was actually wrong. Now we revert on
  // ANY non-ok response AND surface the reason via a toast.
  async function handleToggle(type: string, checked: boolean) {
    const previous = [...preferences];
    const updated = preferences.map((p) =>
      p.type === type ? { ...p, enabled: checked } : p
    );
    setPreferences(updated);

    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: [{ type, enabled: checked }] }),
      });
      if (!res.ok) {
        // Server rejected — revert local state so UI stays in sync with server.
        console.error("Preference save rejected:", res.status);
        setPreferences(previous);
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? `Failed to save preference (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error("Failed to save preference:", err);
      setPreferences(previous);
      toast.error(err instanceof Error ? err.message : "Failed to save preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Install App Card */}
      {!isInstalled && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-5 text-blue-600" />
              Install App
            </CardTitle>
            <CardDescription>
              Install Sight Manager as an app for the best experience — full screen, faster loading, and push notifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {installPrompt ? (
              <Button onClick={handleInstall} className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                <Download className="size-4" />
                Install Sight Manager
              </Button>
            ) : isIOS ? (
              <div className="space-y-3">
                <Button variant="outline" className="w-full gap-2" onClick={() => setShowIOSGuide(!showIOSGuide)}>
                  <Share className="size-4" />
                  How to install on iOS
                </Button>
                {showIOSGuide && (
                  <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-2">
                    <p className="font-medium">To install on your iPhone or iPad:</p>
                    <ol className="list-decimal ml-4 space-y-1 text-xs text-muted-foreground">
                      <li>Tap the <strong>Share</strong> button <Share className="inline size-3" /> in Safari</li>
                      <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
                      <li>Tap <strong>&quot;Add&quot;</strong> in the top right</li>
                      <li>Open Sight Manager from your home screen</li>
                    </ol>
                    <p className="text-xs text-muted-foreground">Once installed, push notifications will be available.</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Open this site in Chrome, Edge, or Samsung Internet to install as an app.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {isInstalled && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <Download className="size-4 shrink-0" />
          <p className="font-medium">App installed — you&apos;re using Sight Manager as an app</p>
        </div>
      )}

      {/* Push Subscription Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Receive browser push notifications for important updates. On iOS,
            add this app to your Home Screen first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking notification status...
            </div>
          )}

          {status === "unsupported" && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="size-4 shrink-0" />
              <div>
                <p className="font-medium">Not supported</p>
                <p className="mt-0.5 text-xs">
                  Push notifications are not supported in this browser. Try
                  Chrome, Edge, or Safari (16.4+). On iOS, add this app to your
                  Home Screen first.
                </p>
              </div>
            </div>
          )}

          {status === "denied" && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <BellOff className="size-4 shrink-0" />
              <div>
                <p className="font-medium">Notifications blocked</p>
                <p className="mt-0.5 text-xs">
                  You&apos;ve blocked notifications for this site. To enable
                  them, update your browser&apos;s notification settings.
                </p>
              </div>
            </div>
          )}

          {(status === "prompt" || status === "unsubscribed") && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  Enable push notifications
                </p>
                <p className="text-xs text-muted-foreground">
                  Get notified about overdue jobs, deliveries, and more
                </p>
              </div>
              <Button onClick={subscribe} size="sm">
                <Bell className="size-4" />
                Enable
              </Button>
            </div>
          )}

          {status === "subscribed" && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                  Active
                </Badge>
                <p className="text-sm">
                  Push notifications are enabled on this device
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={unsubscribe}>
                Disable
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose which notifications you want to receive
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {preferences.map((pref) => {
                const meta = NOTIFICATION_TYPE_META[pref.type];
                if (!meta) return null;
                return (
                  <div
                    key={pref.type}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-sm font-medium">
                        {meta.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                    <Switch
                      checked={pref.enabled}
                      onCheckedChange={(checked) =>
                        handleToggle(pref.type, checked)
                      }
                      disabled={saving}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
