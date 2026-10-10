import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The analyzer was merged into the scan page; keep old bookmarks and the installed app working.
    return [{ source: "/analyze", destination: "/scan", permanent: true }];
  },
};

export default nextConfig;
