import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * La imagen de Docker compila con NEXT_OUTPUT=standalone: deja en
   * `.next/standalone` un `server.js` con sólo los node_modules que hacen
   * falta. Fuera de Docker (dev, Vercel, `next start`) no se activa, porque
   * `next start` no sirve una build standalone.
   */
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
