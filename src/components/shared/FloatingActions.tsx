"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, AlertTriangle, ShoppingCart, Building2, X } from "lucide-react";

/**
 * (May 2026 audit #135) Floating Action Button.
 *
 * Mobile-first quick-actions: "Raise a snag" + "Create order" + "New site"
 * always one tap away regardless of which screen the manager is on.
 * Defers to the parent's pickFor flow when an action needs site context
 * but the user isn't on a site page.
 *
 * Hidden on small viewports while inside Walkthrough flow (which has its
 * own dedicated UI) and on the public progress / contractor pages
 * (those layouts don't include the dashboard layout anyway).
 *
 * Design:
 *   - Sits bottom-right, fixed, above scroll content (z-40)
 *   - Mobile: visible at all times
 *   - Desktop (≥md): hidden by default since the header / sidebar
 *     give faster access, but Cmd-K already covers this case
 *   - Tap to expand → three sub-actions slide up
 *   - aria-expanded + aria-haspopup so screen readers announce state
 */
export function FloatingActions() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Hide on the walkthrough page where the existing UI already
  // surfaces the relevant verbs.
  const isWalkthrough = pathname.includes("/walkthrough");

  // Detect site context — if we're on /sites/<id>/... the verbs can
  // route directly into that site instead of the pickFor flow.
  const siteMatch = pathname.match(/^\/sites\/([^/]+)/);
  const siteId = siteMatch?.[1];

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname, searchParams]);

  // Close on Escape so keyboard users can dismiss without clicking
  // the FAB again.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (isWalkthrough) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const actions = [
    {
      label: "Raise a snag",
      icon: AlertTriangle,
      color: "bg-red-600 hover:bg-red-700",
      href: siteId
        ? `/sites/${siteId}?tab=snags&action=new`
        : "/sites?pickFor=snags",
    },
    {
      label: "Create order",
      icon: ShoppingCart,
      color: "bg-violet-600 hover:bg-violet-700",
      href: "/orders?action=new",
    },
    {
      label: "New site",
      icon: Building2,
      color: "bg-blue-600 hover:bg-blue-700",
      href: "/sites?action=new",
    },
  ];

  return (
    // Mobile-only by default. md+ users have the header search button
    // + Cmd-K, which is more efficient than a FAB on those viewports.
    <div className="md:hidden">
      {/* Sub-action buttons — slide up when open */}
      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => go(a.href)}
              className={`flex items-center gap-2 rounded-full ${a.color} px-4 py-2 text-sm font-medium text-white shadow-lg transition-all`}
            >
              <a.icon className="size-4" aria-hidden="true" />
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Main FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        className={`fixed bottom-4 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition-transform ${open ? "rotate-45" : ""}`}
      >
        {open ? (
          <X className="size-6" aria-hidden="true" />
        ) : (
          <Plus className="size-6" aria-hidden="true" />
        )}
      </button>
      {/* Backdrop dims content so the floating buttons read clearly. */}
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-hidden="true"
          tabIndex={-1}
          className="fixed inset-0 z-30 bg-black/20"
        />
      )}
    </div>
  );
}
