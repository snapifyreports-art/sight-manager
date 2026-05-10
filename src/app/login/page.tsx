"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { HardHat, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50/30 to-slate-100" />
      <div className="absolute -top-40 -right-40 size-80 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 size-80 rounded-full bg-indigo-200/30 blur-3xl" />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30">
            <HardHat className="size-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sight Manager
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
              className="mt-1 h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold shadow-md shadow-blue-600/25 transition-all hover:shadow-lg hover:shadow-blue-600/30"
              disabled={loading}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Sight Manager &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
