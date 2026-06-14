"use client";

import { useEffect, useState } from "react";
import { Palette, Loader2, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { PLATFORM } from "@/lib/platform";

/**
 * (May 2026 audit #56 / Jun 2026 white-label) Business-profile + branding UI.
 *
 * Edits the customer business identity that personalises the whole app —
 * documents, emails, the customer/contractor portals, the cabin and the app
 * chrome. "Sight Manager" (the PLATFORM) is never editable here; it only ever
 * appears as a small "Powered by Sight Manager" co-brand.
 */
export function BrandingSection() {
  const [f, setF] = useState({
    brandName: "",
    logoUrl: "",
    darkLogoUrl: "",
    faviconUrl: "",
    primaryColor: "#2563eb",
    secondaryColor: "",
    supportEmail: "",
    legalName: "",
    tradingName: "",
    companyRegistrationNo: "",
    vatNumber: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || cancelled) return;
        setF((prev) => ({
          ...prev,
          brandName: d.brandName ?? "",
          logoUrl: d.logoUrl ?? "",
          darkLogoUrl: d.darkLogoUrl ?? "",
          faviconUrl: d.faviconUrl ?? "",
          primaryColor: d.primaryColor ?? "#2563eb",
          secondaryColor: d.secondaryColor ?? "",
          supportEmail: d.supportEmail ?? "",
          legalName: d.legalName ?? "",
          tradingName: d.tradingName ?? "",
          companyRegistrationNo: d.companyRegistrationNo ?? "",
          vatNumber: d.vatNumber ?? "",
        }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          // empty → null on the server
          secondaryColor: f.secondaryColor || null,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to save"));
        return;
      }
      toast.success("Branding updated. Refresh to see changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-5" />
          Branding & business profile
        </CardTitle>
        <CardDescription>
          Your business identity, used across the app, documents, emails and the
          pages you share with buyers and contractors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <>
            {/* Two-tier explainer */}
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Your brand leads everywhere. <strong>{PLATFORM.name}</strong>{" "}
                always appears as a small &ldquo;{PLATFORM.poweredBy}&rdquo;
                co-brand and can&apos;t be removed. Leave the brand name blank to
                fall back to {PLATFORM.name}.
              </p>
            </div>

            {/* Identity */}
            <Section title="Identity">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Brand name" htmlFor="brand-name">
                  <Input
                    id="brand-name"
                    value={f.brandName}
                    onChange={set("brandName")}
                    placeholder={PLATFORM.name}
                  />
                </Field>
                <Field label="Logo URL" htmlFor="brand-logo" hint="Public image URL (Supabase storage, your CDN, etc.).">
                  <Input id="brand-logo" value={f.logoUrl} onChange={set("logoUrl")} placeholder="https://…/logo.png" />
                </Field>
                <Field label="Primary colour" htmlFor="brand-color">
                  <ColorInput id="brand-color" value={f.primaryColor} onChange={set("primaryColor")} placeholder="#2563eb" />
                </Field>
                <Field label="Secondary / accent colour" htmlFor="brand-color2" hint="Optional second accent.">
                  <ColorInput id="brand-color2" value={f.secondaryColor} onChange={set("secondaryColor")} placeholder="(optional)" />
                </Field>
              </div>
              {f.logoUrl && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border bg-slate-50 p-3">
                  <span className="text-xs text-muted-foreground">Logo preview</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.logoUrl} alt="Logo preview" className="h-10 w-auto max-w-[180px] object-contain" />
                </div>
              )}
            </Section>

            {/* Contact */}
            <Section title="Contact">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Support email" htmlFor="brand-email" hint="Shown in email footers + on shared pages.">
                  <Input id="brand-email" type="email" value={f.supportEmail} onChange={set("supportEmail")} placeholder="support@yourcompany.com" />
                </Field>
              </div>
            </Section>

            {/* Legal identity */}
            <Section title="Legal identity" hint="Used on handover certificates and formal documents.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Legal (registered) name" htmlFor="legal-name">
                  <Input id="legal-name" value={f.legalName} onChange={set("legalName")} placeholder="Acme Construction Ltd" />
                </Field>
                <Field label="Trading name" htmlFor="trading-name">
                  <Input id="trading-name" value={f.tradingName} onChange={set("tradingName")} placeholder="Acme Homes" />
                </Field>
                <Field label="Company registration no." htmlFor="company-no">
                  <Input id="company-no" value={f.companyRegistrationNo} onChange={set("companyRegistrationNo")} placeholder="12345678" />
                </Field>
                <Field label="VAT number" htmlFor="vat-no">
                  <Input id="vat-no" value={f.vatNumber} onChange={set("vatNumber")} placeholder="GB123456789" />
                </Field>
              </div>
            </Section>

            {/* Extra visual */}
            <Section title="Extra visual" hint="For dark email/PWA chrome and the browser tab.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Dark-mode logo URL" htmlFor="dark-logo" hint="A light/white logo for dark backgrounds.">
                  <Input id="dark-logo" value={f.darkLogoUrl} onChange={set("darkLogoUrl")} placeholder="https://…/logo-white.png" />
                </Field>
                <Field label="Favicon URL" htmlFor="favicon" hint="Square icon for browser tabs + installed app.">
                  <Input id="favicon" value={f.faviconUrl} onChange={set("faviconUrl")} placeholder="https://…/favicon.png" />
                </Field>
              </div>
            </Section>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save branding
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ColorInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input id={id} value={value} onChange={onChange} pattern="^#[0-9A-Fa-f]{6}$" placeholder={placeholder} />
      <span className="size-8 shrink-0 rounded-md border" style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "transparent" }} aria-hidden />
    </div>
  );
}
