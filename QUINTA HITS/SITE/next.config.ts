import type { NextConfig } from "next";

/**
 * Versão deste deploy (muda a cada publicação na Vercel): o navegador compara com /api/versao e recarrega sozinho
 * quando sai versão nova (components/AtualizacaoAutomatica.tsx). Fora da Vercel, o horário do build.
 */
const VERSAO = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || `build-${Date.now()}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_VERSAO: process.env.NODE_ENV === "production" ? VERSAO : "" },
  images: { formats: ["image/avif", "image/webp"] },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // HTTPS sempre (2 anos), explícito também nos domínios próprios das casas.
        { key: "Strict-Transport-Security", value: "max-age=63072000" },
        // Política de conteúdo: nada de plugins (<object>), <base> trocado, formulário enviando para fora nem o site
        // aberto dentro de outro. Scripts e estilos ficam livres de propósito (Turnstile, Spotify e Google Fonts).
        { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" },
      ],
    },
    // Página e QR da reserva do cliente: fora dos buscadores (além do robots.txt e do noindex da página).
    { source: "/minha-reserva/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    { source: "/r/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    // O site não usa câmera, microfone, localização nem pagamento do navegador...
    {
      source: "/:caminho((?!casa(?:/|$)).*)",
      headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }],
    },
    // ...só o app da casa usa a câmera, para ler o QR de entrada (check-in na porta).
    { source: "/casa", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" }] },
    { source: "/casa/:path*", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" }] },
    // Painel e sua API nunca ficam em cache de navegador ou de intermediários.
    {
      source: "/(admin|api/admin)/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    },
    // App da casa: páginas e API com nome e WhatsApp de clientes também nunca ficam em cache (ícones e manifest podem).
    { source: "/casa", headers: [{ key: "Cache-Control", value: "no-store" }] },
    { source: "/casa/login", headers: [{ key: "Cache-Control", value: "no-store" }] },
    { source: "/api/casa/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    // Versão no ar e service worker do app: sempre a última (a atualização automática depende disso).
    { source: "/api/versao", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
    { source: "/casa-sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }] },
  ],
};

export default nextConfig;
