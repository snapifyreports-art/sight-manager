import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { PLATFORM, PLATFORM_PRIMARY, type CustomerBranding } from "@/lib/platform";

/**
 * (Jun 2026 white-label) The single source of truth for resolving branding.
 *
 * TWO brands: the CUSTOMER (the construction business using the app — the
 * editable AppSettings singleton) is the prominent identity everywhere
 * user-facing; the PLATFORM ("Sight Manager") is a fixed constant shown only
 * as a subtle "Powered by Sight Manager" co-brand.
 *
 * Every server surface (layout, PDFs, emails, external pages) calls
 * getBranding() ONCE per request instead of inventing its own
 * `?? "Sight Manager"` fallback. Client components get the resolved values
 * threaded down as props, or fetch GET /api/settings/branding.
 */
export { PLATFORM };
export type { CustomerBranding };

export interface Branding {
  customer: CustomerBranding;
  platform: typeof PLATFORM;
}

type Db = PrismaClient | Prisma.TransactionClient;

type AppSettingsRow = {
  brandName: string | null;
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  supportEmail: string | null;
  legalName: string | null;
  tradingName: string | null;
  companyRegistrationNo: string | null;
  vatNumber: string | null;
};

/**
 * Map a raw AppSettings row (or null) to the resolved CustomerBranding.
 * brandName falls back to the platform name; the raw value is kept so the
 * UI can distinguish "unbranded" from "named after the platform".
 */
export function resolveCustomerBranding(s: AppSettingsRow | null): CustomerBranding {
  return {
    brandName: s?.brandName?.trim() || PLATFORM.name,
    brandNameRaw: s?.brandName ?? null,
    logoUrl: s?.logoUrl ?? null,
    darkLogoUrl: s?.darkLogoUrl ?? null,
    faviconUrl: s?.faviconUrl ?? null,
    primaryColor: s?.primaryColor ?? PLATFORM_PRIMARY,
    secondaryColor: s?.secondaryColor ?? null,
    supportEmail: s?.supportEmail ?? null,
    legalName: s?.legalName ?? null,
    tradingName: s?.tradingName ?? null,
    companyRegistrationNo: s?.companyRegistrationNo ?? null,
    vatNumber: s?.vatNumber ?? null,
  };
}

/** Load the resolved customer + platform branding. Never throws. */
export async function getBranding(db: Db = prisma): Promise<Branding> {
  let row: AppSettingsRow | null = null;
  try {
    row = await db.appSettings.findUnique({ where: { id: "default" } });
  } catch {
    row = null;
  }
  return { customer: resolveCustomerBranding(row), platform: PLATFORM };
}

/** Convenience: just the resolved customer branding. */
export async function getCustomerBranding(db: Db = prisma): Promise<CustomerBranding> {
  return (await getBranding(db)).customer;
}
