"use client";

/**
 * Tiny vector-line animation of a house being built. Replaces the
 * generic Loader2 spinner inside the global "Working…" indicator —
 * Keith's UX brief: while the system is working, show a tiny house
 * being built in line style. On-brand with what the app actually
 * does.
 *
 * How it works: each piece of the house is a line / polyline /
 * rectangle drawn with a stroke-dash trick — strokeDasharray equals
 * the path's length so the whole stroke is "missing" at offset =
 * length, then we animate dashoffset to 0 to make it "draw in". The
 * pieces are sequenced via animation-delay so the foundation appears
 * first, then walls, roof, door, window. Then it holds for a beat
 * and "erases" by sweeping the offset the other way for the loop.
 *
 * Strokes are sized for a 64px viewBox; the wrapper component picks
 * the rendered size via Tailwind classes.
 */
export function HouseBuildingAnimation({
  className = "size-8",
}: {
  className?: string;
}) {
  // Total cycle = 3.6s. Stages animate over this:
  //   0.0 - 0.4   foundation
  //   0.4 - 0.8   walls
  //   0.8 - 1.2   roof
  //   1.2 - 1.6   door
  //   1.6 - 2.0   window
  //   2.0 - 3.0   hold (full house drawn)
  //   3.0 - 3.6   erase + restart
  //
  // Tailwind doesn't expose stroke-dash animations natively so we
  // inline keyframes via styled-jsx.
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} text-blue-600`}
      aria-hidden
    >
      {/* Foundation — bottom rectangle base */}
      <line className="hb-foundation" x1="8" y1="55" x2="56" y2="55" />

      {/* Walls — left + right */}
      <line className="hb-wall-left" x1="12" y1="55" x2="12" y2="28" />
      <line className="hb-wall-right" x1="52" y1="55" x2="52" y2="28" />
      <line className="hb-wall-top" x1="12" y1="28" x2="52" y2="28" />

      {/* Roof — pitched */}
      <polyline className="hb-roof" points="9,28 32,12 55,28" />

      {/* Door */}
      <rect
        className="hb-door"
        x="28"
        y="42"
        width="8"
        height="13"
        rx="0.5"
      />

      {/* Window */}
      <rect
        className="hb-window"
        x="38"
        y="34"
        width="8"
        height="6"
        rx="0.5"
      />

      <style jsx>{`
        /* Each piece is drawn by animating stroke-dashoffset from its
           own length down to 0 — same trick as svg-stroke "draw"
           tutorials. Different stroke-dasharray per piece so the
           timing matches its actual length. */
        @keyframes hb-draw {
          0%, 5%   { stroke-dashoffset: var(--len); opacity: 0; }
          10%      { opacity: 1; }
          25%      { stroke-dashoffset: 0; opacity: 1; }
          75%      { stroke-dashoffset: 0; opacity: 1; }
          90%      { stroke-dashoffset: 0; opacity: 1; }
          100%     { stroke-dashoffset: var(--len); opacity: 0; }
        }
        line, polyline, rect {
          animation: hb-draw 3.6s ease-in-out infinite;
          stroke-dasharray: var(--len);
          stroke-dashoffset: var(--len);
          will-change: stroke-dashoffset, opacity;
        }
        .hb-foundation { --len: 50px; animation-delay: 0s; }
        .hb-wall-left  { --len: 28px; animation-delay: 0.25s; }
        .hb-wall-right { --len: 28px; animation-delay: 0.35s; }
        .hb-wall-top   { --len: 40px; animation-delay: 0.55s; }
        .hb-roof       { --len: 60px; animation-delay: 0.85s; }
        .hb-door       { --len: 42px; animation-delay: 1.2s; }
        .hb-window     { --len: 28px; animation-delay: 1.45s; }
      `}</style>
    </svg>
  );
}
