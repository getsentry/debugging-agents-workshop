import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's stable replacement for the template's experimental
  // ppr/useCache flags — required for the 'use cache' directives in lib/commerce.
  cacheComponents: true,
  // Prefetch only the static shell of routes with dynamic data (cart cookie,
  // searchParams) so <Link prefetch={true}> stops triggering full dynamic
  // renders — see the instant-link-prefetch-partial warning.
  partialPrefetching: true,
  experimental: {
    inlineCss: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
