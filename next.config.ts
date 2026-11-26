import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * La imagen de Docker compila con NEXT_OUTPUT=standalone: deja en
   * `.next/standalone` un `server.js` con sólo los node_modules que hacen
   * falta. Fuera de Docker (`pnpm dev`, `next start`) no se activa, porque
   * `next start` no sirve una build standalone.
   */
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
