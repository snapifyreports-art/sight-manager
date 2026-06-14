import { ImageResponse } from "next/og";
import { getBranding } from "@/lib/branding";

/**
 * (Jun 2026 white-label) Dynamic favicon. A rounded square tinted with the
 * customer's primary colour showing the first 1-2 letters of the brand name.
 * Next serves this as the <link rel="icon"> for the app, so the browser tab
 * + bookmarks carry the tenant's accent + initial rather than a generic mark.
 */
export const dynamic = "force-dynamic";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** First 1-2 letters of the brand name (e.g. "Acme Build" → "AB", "Acme" → "A"). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "S";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default async function Icon() {
  const { customer } = await getBranding();
  const label = initials(customer.brandName);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: customer.primaryColor,
          color: "#ffffff",
          fontSize: label.length > 1 ? 16 : 20,
          fontWeight: 700,
          borderRadius: 7,
        }}
      >
        {label}
      </div>
    ),
    { ...size },
  );
}
