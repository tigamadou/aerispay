import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow build to continue even if some pages fail prerendering
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
