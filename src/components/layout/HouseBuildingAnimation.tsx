"use client";

/**
 * Tiny vector-line animation of a house being built. Replaces the
 * generic Loader2 spinner inside the global "Working…" indicator —
 * Keith's UX brief: while the system is working, show a tiny house
 * being built in line style. On-brand with what the app actually
 * does.
 *
 * Each piece of the house is a line / polyline / rectangle drawn
 * with a stroke-dash trick. We set strokeDasharray to the path's
 * pixel length so the whole stroke is "missing" at offset = length,
 * then animate dashoffset to 0 so the line draws in. Pieces are
 * sequenced via animation-delay so the foundation appears first,
 * then walls, roof, door, window. Hold for a beat, then sweep back
 * out for a continuous loop.
 *
 * Implementation note (Nov 2026): originally used styled-jsx for
 * the keyframes but the scoping rules don't reliably reach SVG
 * children — animation just didn't fire. Switched to inline `style`
 * attributes on each element + a single `<style>` tag (not scoped)
 * for the @keyframes. The keyframe name is unique enough not to
 * collide with anything global.
 */
export function HouseBuildingAnimation({
  className = "size-8",
}: {
  className?: string;
}) {
  // Per-element animation timing. Total cycle = 3.6s. Each piece
  // animates over the full cycle but with its own delay so they
  // appear in build order.
  //
  // The `--hb-len` CSS variable is set per-element so the keyframes
  // can reference each piece's own path length. Without this, every
  // piece would animate to/from the same fixed offset which would
  // over-erase short pieces and leave long ones partially drawn.
  const baseAnim =
    "hb-draw 3.6s cubic-bezier(0.4, 0, 0.2, 1) infinite";
  const piece = (
    length: number,
    delaySeconds: number,
  ): React.CSSProperties =>
    // CSSProperties doesn't type custom-property keys; cast a
    // record-shape so `--hb-len` is allowed.
    ({
      strokeDasharray: length,
      strokeDashoffset: length,
      animation: baseAnim,
      animationDelay: `${delaySeconds}s`,
      ["--hb-len" as string]: `${length}px`,
    }) as React.CSSProperties;

  return (
    <>
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
        <line x1="8" y1="55" x2="56" y2="55" style={piece(50, 0)} />

        {/* Walls — left + right + top plate */}
        <line x1="12" y1="55" x2="12" y2="28" style={piece(28, 0.25)} />
        <line x1="52" y1="55" x2="52" y2="28" style={piece(28, 0.35)} />
        <line x1="12" y1="28" x2="52" y2="28" style={piece(40, 0.55)} />

        {/* Roof — pitched */}
        <polyline
          points="9,28 32,12 55,28"
          style={piece(60, 0.85)}
        />

        {/* Door */}
        <rect
          x="28"
          y="42"
          width="8"
          height="13"
          rx="0.5"
          style={piece(42, 1.2)}
        />

        {/* Window */}
        <rect
          x="38"
          y="34"
          width="8"
          height="6"
          rx="0.5"
          style={piece(28, 1.45)}
        />
      </svg>
      <style>{`
        @keyframes hb-draw {
          0%, 5%   { stroke-dashoffset: var(--hb-len, 60px); opacity: 0; }
          10%      { opacity: 1; }
          30%      { stroke-dashoffset: 0; opacity: 1; }
          78%      { stroke-dashoffset: 0; opacity: 1; }
          100%     { stroke-dashoffset: var(--hb-len, 60px); opacity: 0; }
        }
      `}</style>
    </>
  );
}
