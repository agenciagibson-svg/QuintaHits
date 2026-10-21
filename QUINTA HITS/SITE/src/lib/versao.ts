/**
 * Versão publicada do site: muda a cada deploy na Vercel. Fixada no BUILD (next.config.ts → NEXT_PUBLIC_VERSAO), então
 * o navegador traz embutida a versão que carregou e o servidor responde a versão que está no ar (/api/versao).
 * Diferentes = saiu deploy novo depois que a página abriu → hora de recarregar (components/AtualizacaoAutomatica.tsx).
 */
export const VERSAO_DO_BUILD = process.env.NEXT_PUBLIC_VERSAO ?? "";

/** Há versão nova no ar? Sem versão de um dos lados (dev, falha de rede) nunca recarrega. */
export const temVersaoNova = (doNavegador: string, doServidor: unknown): boolean =>
  !!doNavegador && typeof doServidor === "string" && doServidor !== "" && doServidor !== doNavegador;
