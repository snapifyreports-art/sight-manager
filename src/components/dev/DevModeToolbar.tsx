"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bug, X, Calendar } from "lucide-react";
import { useDevDate } from "@/lib/dev-date-context";
import { format } from "date-fns";

export function DevModeToolbar() {
  const { devDate, isDevMode, setDevDate } = useDevDate();
  const [showPicker, setShowPicker] = useState(false);
  const pathname = usePathname();

  // Close dropdown on route change
  useEffect(() => {
    setShowPicker(false);
  }, [pathname]);

  // Format the display date
  const displayDate = devDate
    ? format(new Date(devDate + "T00:00:00"), "dd MMM yyyy")
    : null;

  return (
    <>
      {/* Floating amber banner when dev mode is active */}
      {isDevMode && (
        <div className="pointer-events-none fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1 text-xs font-bold text-white shadow-md">
          <Bug className="size-3.5" />
          <span>DEV MODE &mdash; Viewing as {displayDate}</span>
          <button
            onClick={() => setDevDate(null)}
            className="pointer-events-auto ml-2 rounded-full p-0.5 hover:bg-amber-600"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Toolbar button in header */}
      <div className="relative">
        <button
          onClick={() => {
            if (isDevMode) {
              setShowPicker(!showPicker);
            } else {
              // Activate with today's date
              const today = new Date()
                .toISOString()
                .split("T")[0];
              setDevDate(today);
              setShowPicker(true);
            }
          }}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            isDevMode
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          }`}
          title="Toggle Dev Mode"
        >
          <Bug className="size-3.5" />
          {isDevMode ? "Dev" : "Dev"}
        </button>

        {/* Date picker dropdown */}
        {showPicker && isDevMode && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setShowPicker(false)}
            />
            <div className="absolute right-0 top-full z-[9998] mt-2 w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Dev Mode Date
                </h3>
                <button
                  onClick={() => {
                    setDevDate(null);
                    setShowPicker(false);
                  }}
                  className="rounded-md px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  Disable
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Set date
                  </label>
                  <input
                    type="date"
                    value={devDate || ""}
                    onChange={(e) => {
                      if (e.target.value) {
                        setDevDate(e.target.value);
                      }
                    }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* Quick date presets */}
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">
                    Quick jump
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Yesterday", days: -1 },
                      { label: "Tomorrow", days: 1 },
                      { label: "-1 Week", days: -7 },
                      { label: "+1 Week", days: 7 },
                      { label: "-1 Month", days: -30 },
                      { label: "+1 Month", days: 30 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          const base = devDate
                            ? new Date(devDate + "T00:00:00")
                            : new Date();
                          base.setDate(base.getDate() + preset.days);
                          setDevDate(base.toISOString().split("T")[0]);
                        }}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDevDate(new Date().toISOString().split("T")[0]);
                  }}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground hover:border-green-500/50 hover:bg-green-500/10 hover:text-green-600"
                >
                  <Calendar className="mr-1 inline size-3" />
                  Reset to Real Today
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
