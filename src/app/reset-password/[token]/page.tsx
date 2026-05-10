"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * (May 2026 audit #132 + #133) Public reset-password page.
 *
 * Lands here from the email link. Token is in the URL path (no auth
 * cookie required). User sets a new password; the API verifies the
 * token signature + exp + email match before writing.
 *
 * No client-side token verification — the API has the secret. Don't
 * try to surface "this link is expired" before submitting; the UI
 * just shows the same form and the API responds with the right
 * error after the attempt.
 */
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't reset password.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      // Brief moment so the user can see the success copy before
      // we redirect to the login page.
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
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
            Set a new password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose something memorable — at least {MIN_PASSWORD_LENGTH}{" "}
            characters.
          </p>
        </div>

        {success ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Password updated</p>
            <p className="mt-1">Redirecting to login…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-[13px] font-medium text-slate-700">
                New password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 pr-10 text-sm transition-colors focus:bg-white"
                />
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
              {passwordTooShort && (
                <p className="text-xs text-amber-600">
                  Need at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm" className="text-[13px] font-medium text-slate-700">
                Confirm new password
              </Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                disabled={loading}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-sm transition-colors focus:bg-white"
              />
              {passwordsMismatch && (
                <p className="text-xs text-red-600">Passwords don&apos;t match.</p>
              )}
            </div>
            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold shadow-md shadow-blue-600/25"
              disabled={loading || password.length < MIN_PASSWORD_LENGTH || password !== confirm}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
