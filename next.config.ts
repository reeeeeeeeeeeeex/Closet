import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite", "sharp", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
