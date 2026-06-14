/**
 * (Jun 2026 white-label) The PLATFORM brand — "Sight Manager", the product
 * itself. This is a FIXED constant the customer can NEVER edit; it appears
 * only as a subtle "Powered by Sight Manager" co-brand. The CUSTOMER brand
 * (AppSettings, see getBranding in branding.ts) is the prominent identity
 * everywhere user-facing.
 *
 * Client-safe: NO server imports (no prisma), so client components can render
 * the co-brand line and the resolved branding types without pulling server
 * code into the browser bundle. Server code uses getBranding() from
 * branding.ts.
 */
export const PLATFORM = {
  name: "Sight Manager",
  poweredBy: "Powered by Sight Manager",
  url: "https://sight-manager.vercel.app",
} as const;

/** Default accent when the business hasn't picked one. */
export const PLATFORM_PRIMARY = "#2563eb";

/**
 * Resolved customer-brand shape used across the app. `brandName` is always a
 * usable display string (falls back to the platform name); `brandNameRaw` is
 * null when the business hasn't set its own name yet.
 */
export interface CustomerBranding {
  brandName: string;
  brandNameRaw: string | null;
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  supportEmail: string | null;
  legalName: string | null;
  tradingName: string | null;
  companyRegistrationNo: string | null;
  vatNumber: string | null;
}
