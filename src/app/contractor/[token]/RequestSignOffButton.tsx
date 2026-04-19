"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

/**
 * Contractor-side "Request Sign-Off" button. Posts to the token-auth'd
 * endpoint so no login is needed. When the site manager next opens the
 * job, they see "Sign Off Requested" prominently.
 *
 * Disabled with "Requested" state after success. Page refresh or revisit
 * re-reads job.signOffRequested so the state persists.
 */
export function RequestSignOffButton({
  token,
  jobId,
  alreadyRequested,
}: {
  token: string;
  jobId: string;
  alreadyRequested: boolean;
}) {
  const [requested, setRequested] = useState(alreadyRequested);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contractor-share/${token}/request-signoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        setRequested(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to send request");
      }
    } finally {
      setLoading(false);
    }
  };

  if (requested) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 print:hidden">
        <CheckCircle2 className="size-3" />
        Sign-off requested
      </span>
    );
  }

  return (
    <div className="print:hidden">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
        Request sign-off
      </button>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
