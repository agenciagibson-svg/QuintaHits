/**
 * Dados estruturados (JSON-LD) dentro de <script>: o JSON.stringify não escapa "<", então um texto do painel com
 * "</script>" fecharia a tag e viraria código na página. Escapando "<", ">" e "&" o JSON continua igual para o Google.
 */
export function jsonLdSeguro(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
