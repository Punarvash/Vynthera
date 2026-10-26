import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Cost and search data are read from disk at runtime (src/lib/costs.ts, src/lib/suggest.ts); ship them with the server bundle.
  outputFileTracingIncludes: {
    "/drug/*": ["./data/costs/**/*", "./data/search/**/*"],
    "/drug/[name]": ["./data/costs/**/*", "./data/search/**/*"],
    "/search": ["./data/costs/**/*", "./data/search/**/*"],
    "/api/suggest": ["./data/costs/**/*", "./data/search/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
