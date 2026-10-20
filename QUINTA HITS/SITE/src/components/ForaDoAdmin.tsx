"use client";

import { usePathname } from "next/navigation";
import { ehPaginaDeOutraCasa } from "@/config/casas";

/**
 * Mostra o conteúdo só no site público da Quinta Hits: o painel /admin, o app da casa /casa e as páginas de reserva de
 * outras casas (ex.: /harley-grill) têm navegação própria (sem cabeçalho, faixa, rodapé e dados estruturados da Quinta Hits).
 */
export default function ForaDoAdmin({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const fora = caminho?.startsWith("/admin") || caminho === "/casa" || caminho?.startsWith("/casa/") || ehPaginaDeOutraCasa(caminho);
  return fora ? null : <>{children}</>;
}
