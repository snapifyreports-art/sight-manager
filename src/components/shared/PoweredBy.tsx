import { HardHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM } from "@/lib/platform";

/**
 * (Jun 2026 white-label) The platform co-brand badge — "Powered by Sight
 * Manager" with the Sight Manager mark. The CUSTOMER brand leads every
 * surface; this is how the PLATFORM is credited: a tasteful, recognisable
 * badge (think "Powered by Stripe"), not a whispered grey line.
 *
 * theme="dark" for dark backgrounds (the cabin, email headers); asLink links
 * to the product (good on web surfaces, off on the read-only cabin TV).
 */
export function PoweredBy({
  className,
  theme = "light",
  size = "sm",
  asLink = true,
}: {
  className?: string;
  theme?: "light" | "dark";
  size?: "sm" | "md";
  asLink?: boolean;
}) {
  const dark = theme === "dark";
  const md = size === "md";

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border transition-colors",
        md ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]",
        dark
          ? "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
          : "border-slate-200 bg-white/70 text-slate-500 hover:bg-slate-50",
        className,
      )}
    >
      <span className={cn("uppercase tracking-wide", dark ? "text-white/45" : "text-slate-400")}>
        Powered by
      </span>
      <span
        className={cn(
          "flex items-center justify-center rounded bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm",
          md ? "size-5" : "size-4",
        )}
        aria-hidden
      >
        <HardHat className={md ? "size-3" : "size-2.5"} />
      </span>
      <span className={cn("font-semibold", dark ? "text-white/90" : "text-slate-700")}>
        {PLATFORM.name}
      </span>
    </span>
  );

  if (!asLink) return content;
  return (
    <a
      href={PLATFORM.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={PLATFORM.poweredBy}
      className="inline-flex"
    >
      {content}
    </a>
  );
}
