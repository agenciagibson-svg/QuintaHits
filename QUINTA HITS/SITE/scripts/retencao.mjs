// Rotina de retenção de dados (LGPD) em linha de comando — SÓ PARA HOMOLOGAÇÃO.
//
//   node --env-file=.env.development.local scripts/retencao.mjs --ambiente=homologacao            (simulação: só conta)
//   node --env-file=.env.development.local scripts/retencao.mjs --ambiente=homologacao --executar (aplica, se permitido)
//
// Por padrão SIMULA: conta o que seria afetado e não altera nada. Registra apenas QUANTIDADES, nunca conteúdo.
// A execução real ainda exige RETENCAO_ENABLED=true e wa_config.limpeza_ativa = true.
// O script recusa rodar contra qualquer banco que não esteja marcado como homologação (wa_config.ambiente).
import { createClient } from "@supabase/supabase-js";
import { executarRetencao } from "../src/lib/agente/retencao.ts";

const recusar = (motivo) => {
  console.error(`Recusado: ${motivo}`);
  process.exit(2);
};

const args = process.argv.slice(2);
const executar = args.includes("--executar");

if (!args.includes("--ambiente=homologacao")) {
  recusar("este script só roda em HOMOLOGAÇÃO. Use --ambiente=homologacao (produção é feita pelo painel, depois da validação da política).");
}
if (process.env.APP_AMBIENTE !== "homologacao") recusar("APP_AMBIENTE precisa ser 'homologacao'.");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) recusar("variáveis do Supabase de homologação ausentes (use --env-file com o arquivo de homologação).");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: config } = await db.from("wa_config").select("ambiente").eq("id", 1).maybeSingle();
if (config?.ambiente !== "homologacao") recusar("o banco não está marcado como homologação (wa_config.ambiente).");

try {
  const r = await executarRetencao(db, { simular: !executar, retencaoEnv: process.env.RETENCAO_ENABLED, ambienteApp: "homologacao" });
  console.log(r.simulado ? "SIMULAÇÃO (nada foi alterado):" : "EXECUÇÃO REAL:");
  for (const [nome, n] of Object.entries(r.contagens)) console.log(`  ${nome.padEnd(42)} ${n}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : "erro");
  process.exit(1);
}
