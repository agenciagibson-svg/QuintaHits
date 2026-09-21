// REGISTRO DO NÚMERO DA QUINTA HITS NA WHATSAPP CLOUD API (endpoint /register).
//
// >>> NÃO RODE ESTE SCRIPT ANTES DA APROVAÇÃO DA META. Ele só existe para o dia da ativação, e SÓ o responsável o executa. <<<
//
// Este é um comando manual e separado, com várias travas ao mesmo tempo. Qualquer uma faltando = recusa, sem falar com a Meta:
//   1. WHATSAPP_REGISTRATION_ENABLED=true (texto exato) no ambiente deste comando;
//   2. o argumento --confirmo-registrar-quinta-hits;
//   3. terminal INTERATIVO (nada de pipe, CI ou automação);
//   4. WHATSAPP_PHONE_NUMBER_ID igual ao ID da QUINTA HITS (1352142871312651): NUNCA o número final 0200;
//   5. WHATSAPP_TOKEN presente;
//   6. você digitar a frase exata de confirmação;
//   7. você digitar o PIN de 6 dígitos (a digitação NÃO aparece na tela; o PIN nunca vai para argumento, arquivo ou log).
//
// Uso (só no dia, no seu terminal, com as variáveis definidas SÓ para este comando):
//   WHATSAPP_REGISTRATION_ENABLED=true WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_TOKEN=... node scripts/registrar-numero.mjs --confirmo-registrar-quinta-hits
//
// Ele NÃO altera o webhook, NÃO altera a verificação em duas etapas, NÃO envia mensagem e NÃO toca no número 0200.

import { pathToFileURL } from "node:url";

export const PHONE_NUMBER_ID_QUINTA_HITS = "1352142871312651";
export const ARGUMENTO_DE_CONFIRMACAO = "--confirmo-registrar-quinta-hits";
export const FRASE_DE_CONFIRMACAO = `REGISTRAR ${PHONE_NUMBER_ID_QUINTA_HITS}`;

/** Confere tudo o que dá para conferir ANTES de perguntar qualquer coisa. Devolve a lista de motivos de recusa (vazia = pode seguir). */
export function motivosDeRecusa({ env, argv, interativo }) {
  const motivos = [];
  if (env.WHATSAPP_REGISTRATION_ENABLED !== "true") motivos.push("WHATSAPP_REGISTRATION_ENABLED não está com o valor exato 'true'.");
  if (!argv.includes(ARGUMENTO_DE_CONFIRMACAO)) motivos.push(`falta o argumento ${ARGUMENTO_DE_CONFIRMACAO}.`);
  if (!interativo) motivos.push("o comando precisa rodar em um terminal interativo (sem pipe, CI ou automação).");
  if ((env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim() !== PHONE_NUMBER_ID_QUINTA_HITS) motivos.push("WHATSAPP_PHONE_NUMBER_ID não é o da QUINTA HITS (este script nunca registra outro número).");
  if (!env.WHATSAPP_TOKEN) motivos.push("WHATSAPP_TOKEN ausente.");
  return motivos;
}

/**
 * Executa o registro. `perguntar(texto)` e `perguntarOculto(texto)` e `fetchImpl` são injetáveis para os testes
 * (que usam respostas e rede FALSAS: nenhum teste chama a Meta).
 */
export async function registrar({ env, argv, interativo, perguntar, perguntarOculto, fetchImpl = fetch, log = console.log }) {
  const motivos = motivosDeRecusa({ env, argv, interativo });
  if (motivos.length > 0) {
    log("Registro RECUSADO. Nada foi enviado à Meta:");
    for (const m of motivos) log(`  - ${m}`);
    return { ok: false, recusado: true, motivos };
  }
  const frase = (await perguntar(`Para registrar o número da QUINTA HITS na Cloud API, digite exatamente: ${FRASE_DE_CONFIRMACAO}\n> `)).trim();
  if (frase !== FRASE_DE_CONFIRMACAO) {
    log("Frase de confirmação incorreta. Nada foi enviado à Meta.");
    return { ok: false, recusado: true, motivos: ["frase de confirmação incorreta"] };
  }
  const pin = (await perguntarOculto("PIN de 6 dígitos (a digitação não aparece): ")).trim();
  if (!/^\d{6}$/.test(pin)) {
    log("PIN inválido (são 6 dígitos). Nada foi enviado à Meta.");
    return { ok: false, recusado: true, motivos: ["PIN inválido"] };
  }
  const versao = /^v\d+\.\d+$/.test(env.META_GRAPH_API_VERSION ?? "") ? env.META_GRAPH_API_VERSION : "v21.0";
  const res = await fetchImpl(`https://graph.facebook.com/${versao}/${PHONE_NUMBER_ID_QUINTA_HITS}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  // Nunca imprime o corpo da resposta inteiro, o token nem o PIN: só o status.
  log(res.ok ? "Registro enviado à Meta com sucesso." : `A Meta recusou o registro (HTTP ${res.status}).`);
  return { ok: res.ok, recusado: false, status: res.status };
}

async function perguntarNoTerminal(texto) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(texto); } finally { rl.close(); }
}

/** Lê o PIN sem mostrar o que é digitado. */
function perguntarOcultoNoTerminal(texto) {
  return new Promise((resolve) => {
    process.stdout.write(texto);
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let digitado = "";
    const aoDigitar = (c) => {
      if (c === "\r" || c === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", aoDigitar);
        process.stdout.write("\n");
        resolve(digitado);
      } else if (c === String.fromCharCode(3)) {
        // Ctrl+C
        process.exit(130);
      } else if (c === String.fromCharCode(127) || c === String.fromCharCode(8)) {
        // Backspace
        digitado = digitado.slice(0, -1);
      } else {
        digitado += c;
      }
    };
    stdin.on("data", aoDigitar);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resultado = await registrar({
    env: process.env,
    argv: process.argv.slice(2),
    interativo: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    perguntar: perguntarNoTerminal,
    perguntarOculto: perguntarOcultoNoTerminal,
  });
  process.exit(resultado.ok ? 0 : 1);
}
