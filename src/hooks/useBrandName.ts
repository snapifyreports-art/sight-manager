"use client";

import { useEffect, useState } from "react";
import { PLATFORM } from "@/lib/platform";

/**
 * (Jun 2026 white-label) Client-side branding fetch for report views.
 *
 * Fetches GET /api/settings/branding once and resolves the customer DISPLAY
 * name (brandName || platformName) plus the optional support email, so report
 * components can:
 *   - pass `brandName` into <ReportExportButtons /> (Excel brand row), and
 *   - render a print-only <PrintBrandHeader /> banner.
 *
 * Fail-safe: any fetch error keeps the platform name fallback so a report
 * still renders. The GET endpoint is unauthenticated and returns the raw
 * (nullable) brandName alongside the fixed platformName.
 */
export interface BrandName {
  /** Resolved display name — never empty (falls back to the platform name). */
  brandName: string;
  /** Configured support email, or null when unset. */
  supportEmail: string | null;
}

export function useBrandName(): BrandName {
  const [brand, setBrand] = useState<BrandName>({
    brandName: PLATFORM.name,
    supportEmail: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || cancelled) return;
        setBrand({
          brandName: d.brandName?.trim() || d.platformName || PLATFORM.name,
          supportEmail: d.supportEmail ?? null,
        });
      })
      .catch(() => {
        /* keep the platform fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return brand;
}
