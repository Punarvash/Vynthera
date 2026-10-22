import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Cost data is read from disk at runtime (src/lib/costs.ts); make sure it ships with the server bundle.
  outputFileTracingIncludes: {
    "/drug/*": ["./data/costs/**/*"],
    "/drug/[name]": ["./data/costs/**/*"],
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
