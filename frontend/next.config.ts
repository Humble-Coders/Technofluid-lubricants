// File: frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Product pages are addressed by slugify(series title), so renaming a series moves its
  // page. Keep the old addresses working (links, search results, bookmarks).
  async redirects() {
    return [
      {
        // Renamed 15 Oct 2026: Megacut 150 added as a second grade.
        source: "/products/neat-cutting-oil-technofluid-neat-cutting-oil-55",
        destination: "/products/neat-cutting-oils-technofluid-neat-cutting-oil-55-megacut-150",
        permanent: true,
      },
      {
        // Renamed 15 Oct 2026 to Gaurav's product name.
        source: "/products/technofluid-girth-gear-grease",
        destination: "/products/technofluid-girth-gear-lubricant",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
