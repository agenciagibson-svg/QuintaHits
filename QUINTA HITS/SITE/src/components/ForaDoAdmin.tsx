"use client";

import { usePathname } from "next/navigation";

/** Mostra o conteúdo só no site público: o painel /admin tem navegação própria (sem cabeçalho, faixa e rodapé do site). */
export default function ForaDoAdmin({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  return caminho?.startsWith("/admin") ? null : <>{children}</>;
}
