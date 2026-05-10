"use client";

import { useState } from "react";
import { HardHat, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * (May 2026 audit #133) Public forgot-password page.
 *
 * Submits to /api/auth/request-reset which always returns the same
 * generic 200 — the UI mirrors that by showing the "check your inbox"
 * confirmation regardless of whether the email matched. No account
 * enumeration possible.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // The endpoint always succeeds from the client's perspective —
      // a network failure is the only thing we should react to, and
      // even then the user can just try again.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
            <HardHat className="size-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your account email and we&apos;ll send a reset link.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Check your inbox</p>
            <p className="mt-1">
              If <strong>{email}</strong> matches an account, a reset link is
              on its way. The link expires in 24 hours.
            </p>
            <p className="mt-3 text-center">
              <a
                href="/login"
                className="text-emerald-700 underline-offset-2 hover:underline"
              >
                Back to login
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-[13px] font-medium text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-sm transition-colors focus:bg-white"
              />
            </div>
            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold shadow-md shadow-blue-600/25"
              disabled={loading || !email}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-xs text-slate-500">
              <a
                href="/login"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                Back to login
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
