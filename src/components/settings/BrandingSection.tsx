"use client";

import { useEffect, useState } from "react";
import { Palette, Loader2 } from "lucide-react";
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

/**
 * (May 2026 audit #56) White-label branding admin UI.
 *
 * GET /api/settings/branding on mount → populate form.
 * PUT on save → MANAGE_USERS-gated.
 */
export function BrandingSection() {
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [supportEmail, setSupportEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/settings/branding")
      .then((r) => r.json())
      .then((d) => {
        if (d.brandName) setBrandName(d.brandName);
        if (d.logoUrl) setLogoUrl(d.logoUrl);
        if (d.primaryColor) setPrimaryColor(d.primaryColor);
        if (d.supportEmail) setSupportEmail(d.supportEmail);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          logoUrl: logoUrl || null,
          primaryColor,
          supportEmail: supportEmail || null,
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
          Branding
        </CardTitle>
        <CardDescription>
          Customize the brand name, logo, and primary colour shown across the
          app. Changes apply on next page load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="brand-name">Brand name</Label>
                <Input
                  id="brand-name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Sight Manager"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-email">Support email</Label>
                <Input
                  id="brand-email"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@yourcompany.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-logo">Logo URL</Label>
                <Input
                  id="brand-logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…/logo.png"
                />
                <p className="text-[11px] text-muted-foreground">
                  Upload your logo to a public URL (Supabase storage, your
                  CDN, etc.) and paste the URL here.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-color">Primary colour</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="brand-color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    placeholder="#2563eb"
                  />
                  <span
                    className="size-8 shrink-0 rounded-md border"
                    style={{ backgroundColor: primaryColor }}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
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
