// BACKUP LÓGICO (somente leitura) do Supabase do site: exporta as tabelas para um arquivo JSON local.
//
// Uso (na pasta SITE, com o .env.local presente ou SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente):
//   node scripts/backup-logico.mjs
//
// - SOMENTE LEITURA: só faz GET no PostgREST. Não altera nem apaga nada.
// - O arquivo vai para supabase/backups/ (ignorado pelo Git) e PODE conter dados pessoais (reservas, contatos, conversas):
//   guarde em local seguro e apague quando não precisar mais. NADA é enviado a serviço nenhum.
// - Não imprime chave, URL completa nem conteúdo: só o nome de cada tabela e a quantidade de linhas.
// - Tabelas que ainda não existem neste banco (ex.: as da migração) são puladas e registradas como "ausente".
//
// COMO RESTAURAR (só se algo der errado; a migração é aditiva e não apaga dados, então o normal é NÃO precisar):
//   1. Reversão das migrações (se o problema for a estrutura): reverter-2026-09-21-parte2-site-e-atendimento.sql e, se preciso,
//      reverter-2026-09-21-agente-whatsapp.sql, no SQL Editor. Elas preservam edicoes, mesas, site_config e reservas.
//   2. Perda de DADOS: reinsira as linhas do JSON, tabela por tabela, na ordem edicoes, mesas, site_config, reservas
//      (supabase-js/PostgREST com upsert por chave primária, ou SQL a partir do JSON). Confira antes as contagens do arquivo.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));

function lerEnvLocal() {
  const caminho = `${RAIZ}.env.local`;
  if (!existsSync(caminho)) return {};
  return Object.fromEntries(
    readFileSync(caminho, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
  );
}

const TABELAS = [
  // dados originais do site (o que mais importa preservar)
  "edicoes", "mesas", "site_config", "reservas",
  // parte 1 da migração
  "edicoes_regras", "edicoes_mesas", "wa_config", "wa_contatos", "wa_conversas", "wa_transferencias", "wa_mensagens",
  "wa_webhook_eventos", "wa_fila_saida", "wa_fila_tentativas", "auditoria", "reservas_historico",
  // parte 2
  "wa_notas_internas",
];

async function exportar(url, chave, tabela) {
  const linhas = [];
  for (let inicio = 0; ; inicio += 1000) {
    const res = await fetch(`${url}/rest/v1/${tabela}?select=*`, { headers: { apikey: chave, Authorization: `Bearer ${chave}`, Range: `${inicio}-${inicio + 999}`, "Range-Unit": "items" } });
    if (res.status === 404) return null; // tabela inexistente neste banco
    if (!res.ok) throw new Error(`Falha ao ler ${tabela} (HTTP ${res.status}).`);
    const pagina = await res.json();
    linhas.push(...pagina);
    if (pagina.length < 1000) return linhas;
  }
}

const env = { ...lerEnvLocal(), ...process.env };
const url = env.SUPABASE_URL;
const chave = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessárias (no .env.local ou no ambiente).");
  process.exit(1);
}

const resultado = { gerado_em: new Date().toISOString(), tabelas: {} };
const resumo = [];
for (const tabela of TABELAS) {
  const linhas = await exportar(url, chave, tabela);
  if (linhas === null) { resumo.push(`${tabela}: ausente`); continue; }
  resultado.tabelas[tabela] = linhas;
  resumo.push(`${tabela}: ${linhas.length}`);
}

const pasta = `${RAIZ}supabase/backups`;
mkdirSync(pasta, { recursive: true });
const arquivo = `${pasta}/backup-${resultado.gerado_em.replace(/[:.]/g, "-")}.json`;
writeFileSync(arquivo, JSON.stringify(resultado, null, 2));
console.log("Backup lógico gravado em supabase/backups/ (fora do Git).");
console.log(resumo.join("\n"));
