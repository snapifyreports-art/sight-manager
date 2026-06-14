"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { HardHat, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORM, PLATFORM_PRIMARY } from "@/lib/platform";

// (Jun 2026 white-label) The login page is unauthenticated, so it themes
// itself from the PUBLIC GET /api/settings/branding endpoint. Customer brand
// (logo + name + primary colour) leads; the platform "Powered by Sight
// Manager" line is the only place the product name appears.
type LoginBranding = {
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  platformName: string;
  poweredBy: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [branding, setBranding] = useState<LoginBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || cancelled) return;
        setBranding({
          brandName: d.brandName ?? null,
          logoUrl: d.logoUrl ?? null,
          primaryColor: d.primaryColor ?? PLATFORM_PRIMARY,
          platformName: d.platformName ?? PLATFORM.name,
          poweredBy: d.poweredBy ?? PLATFORM.poweredBy,
        });
      })
      .catch(() => {
        /* unbranded fallback — keep the platform defaults below */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password. Please try again.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const primaryColor = branding?.primaryColor ?? PLATFORM_PRIMARY;
  const displayName = branding?.brandName || branding?.platformName || PLATFORM.name;
  const poweredBy = branding?.poweredBy ?? PLATFORM.poweredBy;
  const logoUrl = branding?.logoUrl ?? null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Background — the soft accent blooms tint to the customer primary
          colour; kept very low-opacity so it reads as a wash, not a slab. */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100" />
      <div
        className="absolute -top-40 -right-40 size-80 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: primaryColor }}
      />
      <div
        className="absolute -bottom-40 -left-40 size-80 rounded-full opacity-10 blur-3xl"
        style={{ backgroundColor: primaryColor }}
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={displayName}
              className="size-14 shrink-0 rounded-2xl object-contain shadow-lg"
            />
          ) : (
            <div
              className="flex size-14 items-center justify-center rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: primaryColor }}
            >
              <HardHat className="size-7" />
            </div>
          )}
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {displayName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Construction Site Management Platform
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-black/[0.04] backdrop-blur-sm">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold text-slate-900">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-[13px] font-medium text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-sm transition-colors focus:bg-white"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-[13px] font-medium text-slate-700">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 pr-10 text-sm transition-colors focus:bg-white"
                />
                {/* (May 2026 audit #35) Restored to keyboard tab order +
                    aria-label so assistive tech can announce + activate it.
                    Pre-fix: tabIndex=-1 with no label — keyboard users
                    couldn't toggle visibility, screen readers got nothing. */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="mt-1 h-11 w-full rounded-xl font-semibold text-white shadow-md transition-all hover:brightness-110 hover:shadow-lg"
              style={{ backgroundColor: primaryColor }}
              disabled={loading}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            {/* (May 2026 audit #133) Forgot password — sends a signed
                reset-token email. The /forgot-password page hosts the
                request form so we don't gum up the login UX. */}
            <p className="mt-2 text-center text-xs text-slate-500">
              <a
                href="/forgot-password"
                className="underline-offset-2 hover:underline"
                style={{ color: primaryColor }}
              >
                Forgot password?
              </a>
            </p>
          </form>
        </div>

        {/* (Jun 2026 white-label) Subtle platform co-brand — the only place
            the product name "Sight Manager" appears on the login screen. */}
        <p className="mt-8 text-center text-xs text-slate-400">
          {poweredBy} &middot; &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
