"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  BellOff,
  Smartphone,
  Loader2,
  AlertTriangle,
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
};

interface Preference {
  type: string;
  enabled: boolean;
}

export function NotificationsSection() {
  const { status, subscribe, unsubscribe } = usePush();
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  // Toggle a preference and save immediately
  async function handleToggle(type: string, checked: boolean) {
    const previous = [...preferences];
    const updated = preferences.map((p) =>
      p.type === type ? { ...p, enabled: checked } : p
    );
    setPreferences(updated);

    setSaving(true);
    try {
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: [{ type, enabled: checked }] }),
      });
    } catch (err) {
      console.error("Failed to save preference:", err);
      // Revert on error
      setPreferences(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
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
