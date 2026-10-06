import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { formats: ["image/avif", "image/webp"] },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // O site não usa câmera, microfone, localização nem pagamento do navegador.
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    },
    // Painel e sua API nunca ficam em cache de navegador ou de intermediários.
    {
      source: "/(admin|api/admin)/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    },
    // App da casa: páginas e API com nome e WhatsApp de clientes também nunca ficam em cache (ícones e manifest podem).
    { source: "/casa", headers: [{ key: "Cache-Control", value: "no-store" }] },
    { source: "/casa/login", headers: [{ key: "Cache-Control", value: "no-store" }] },
    { source: "/api/casa/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
  ],
};

export default nextConfig;
