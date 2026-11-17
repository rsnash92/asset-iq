import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // shared TS source package (retrieval, vector stores, agent tools)
  transpilePackages: ["@asset-iq/core"],
  serverExternalPackages: ["mongodb"],
  // the /evals page reads committed eval results from the monorepo root
  outputFileTracingIncludes: {
    "/evals": ["../../evals/results/latest.json"],
  },
};

export default nextConfig;
