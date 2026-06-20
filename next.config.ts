import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 600_000, // 10 min — large uploads up to 1 GB
    proxyClientMaxBodySize: 1024 * 1024 * 1024, // 1 GB
  },
};

export default nextConfig;
