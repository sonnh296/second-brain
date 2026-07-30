import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 600_000, // 10 min — large uploads up to 1 GB
    proxyClientMaxBodySize: 1024 * 1024 * 1024, // 1 GB
  },
};

export default withNextIntl(nextConfig);
