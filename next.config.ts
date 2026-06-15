import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable client-side router cache to prevent stale data on navigation
    // (kept at 0 per the "always fresh, no caching" decision).
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
    // (Jun 2026 perf) Tree-shake heavy barrel packages so a route only
    // bundles the icons/components/helpers it actually uses. recharts +
    // lucide-react are the biggest offenders on the analytics / brief /
    // programme routes. Behaviour-identical — purely smaller bundles.
    optimizePackageImports: ["recharts", "lucide-react", "date-fns"],
  },
};

export default nextConfig;
