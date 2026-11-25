import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: [
    "tms.consologist.com",
    "https://tms.consologist.com",
    "localhost",
    "http://localhost:3000",
    "127.0.0.1",
    "http://127.0.0.1:3000",
    "0.0.0.0",
    "http://0.0.0.0:3000",
    "ubuntu",
    "http://ubuntu",
    "http://ubuntu:3000",
    "https://ubuntu",
    "https://ubuntu:3000",
    "ubuntu2",
    "http://ubuntu2",
    "http://ubuntu2:3000",
    "https://ubuntu2",
    "https://ubuntu2:3000",
    "account1.consologist.com",
    "https://account1.consologist.com",
    "http://account1.consologist.com",
  ],
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Legacy server-action clients retain their bounded base64 upload limit.
      // The GUI uses the separately authenticated streaming restore endpoint.
      bodySizeLimit: "150mb",
    },
  },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // Skip type checking during Docker build — validated locally via git hooks
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
