import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    DEBUG_AUTH: process.env.DEBUG_AUTH ?? "false",
  },
};

export default nextConfig;
