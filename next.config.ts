import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 600_000, // 10 min — large uploads up to 4 GB
    proxyClientMaxBodySize: 4 * 1024 * 1024 * 1024, // 4 GB
  },
  serverExternalPackages: ['sharp'],
};

export default withNextIntl(nextConfig);
