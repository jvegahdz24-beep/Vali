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
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://cloudflare.com https://*.facebook.com https://*.fbcdn.net https://images.unsplash.com http2.mlstatic.com https://*.mlstatic.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.googleapis.com https://accounts.google.com https://cloudflareinsights.com https://graph.facebook.com https://*.facebook.com ws: wss:",
      "frame-src 'self' https://*.facebook.com https://staticxx.facebook.com",
      "media-src 'self' blob:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,

  // Allow z.ai preview origin for dev assets — only in development
  ...(process.env.NODE_ENV === 'development' ? {
    allowedDevOrigins: [
      "https://preview-chat-22c27b81-178e-4391-a6b6-9e7113a9f3c7.space.chatglm.site",
      "https://preview-chat-22c27b81-178e-4391-a6b6-9e7113a9f3c7.space.z.ai",
    ],
  } : {}),

  // Required for @whiskeysockets/baileys — jimp/sharp are optional deps
  // @prisma/client must be external to avoid Turbopack bundling it with the wrong runtime
  serverExternalPackages: [
    "jimp",
    "@whiskeysockets/baileys",
    "sharp",
    "pino",
    "bcryptjs",
    "jose",
    "qrcode",
    "@prisma/client",
    ".prisma/client",
    "ffmpeg-static",
    "fluent-ffmpeg",
  ],

  // Production security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // SEC-012: Removed open CORS headers for webhook endpoints.
      // Webhooks are server-to-server; CORS headers are not needed
      // and allowing * exposes the endpoint unnecessarily.
      // If a specific trusted origin is required, add it explicitly.
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

  // Rewrites: las fotos subidas en runtime a /public/uploads NO las sirve el
  // handler estático de Next (solo conoce lo que existía al build) → daban 404
  // y las fotos del inventario no aparecían (reporte de Jhon 2026-07-24). Se
  // sirven por una ruta dinámica que lee del disco. Cubre fotos nuevas Y viejas.
  async rewrites() {
    return [
      { source: "/uploads/:file*", destination: "/api/uploads/media/:file*" },
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
