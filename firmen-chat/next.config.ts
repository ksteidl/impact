import type { NextConfig } from "next"

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
]

const nextConfig: NextConfig = {
  // Eigenständiger Server-Build für Docker (node server.js)
  output: "standalone",
  poweredByHeader: false,
  // Keine Telemetrie-relevanten externen Abrufe zur Laufzeit; SQLite & SDKs nicht bündeln
  serverExternalPackages: ["@anthropic-ai/sdk", "openai"],
  // Tailwind CSS v4 über den Turbopack-Loader
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
