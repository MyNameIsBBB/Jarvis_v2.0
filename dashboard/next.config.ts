import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Tailscale Funnel host for Hot Module Replacement
  allowedDevOrigins: ['jarvis-core.taile459d4.ts.net'],
  
  // Proxy API and WebSockets to the local Backend (AI-Agent) running on port 3000
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
      {
        source: '/ws',
        destination: 'http://localhost:3000', // Proxy websocket connections
      }
    ];
  },
};

export default nextConfig;
