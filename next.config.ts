import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable client-side router cache to prevent stale data on navigation
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
