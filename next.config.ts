import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.googleapis.com https://accounts.google.com ws: wss:",
      "media-src 'self' blob:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,

  // Allow z.ai preview origin for dev assets
  allowedDevOrigins: [
    "https://preview-chat-22c27b81-178e-4391-a6b6-9e7113a9f3c7.space.chatglm.site",
    "https://preview-chat-22c27b81-178e-4391-a6b6-9e7113a9f3c7.space.z.ai",
  ],

  // Required for @whiskeysockets/baileys — jimp/sharp are optional deps
  serverExternalPackages: [
    "jimp",
    "@whiskeysockets/baileys",
    "sharp",
    "pino",
    "bcryptjs",
    "jose",
    "qrcode",
  ],

  // Production security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Allow WhatsApp webhook endpoints to receive JSON from external sources
      {
        source: "/api/webhooks/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Webhook-Signature",
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      // Redirect /dashboard to / for consistency (SPA handles routing)
      {
        source: "/dashboard",
        destination: "/",
        permanent: true,
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "*.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
    ],
  },

  // Powered-by header removed for security
  poweredByHeader: false,
};

export default nextConfig;
