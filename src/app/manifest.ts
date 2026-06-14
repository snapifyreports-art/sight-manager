import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/branding";

/**
 * (Jun 2026 white-label) Dynamic PWA manifest. Next serves this file at
 * /manifest.webmanifest (referenced from the root layout metadata). It reads
 * the resolved CUSTOMER branding so an installed app carries the tenant's
 * name + accent colour instead of the platform's. Icons reuse the existing
 * static PNGs in /public/icons — those are the platform marks for now, but
 * the name + theme colour are the per-tenant bits that matter for the
 * install prompt + splash screen.
 *
 * Replaces the static /public/manifest.json (which can't theme per tenant).
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { customer } = await getBranding();
  const name = customer.brandName; // resolved (falls back to platform name)

  return {
    name,
    short_name: name,
    description: `${name} — Construction Site Management`,
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: customer.primaryColor,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
