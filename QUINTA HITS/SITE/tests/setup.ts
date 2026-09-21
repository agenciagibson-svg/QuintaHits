import { afterEach, beforeEach, vi } from "vitest";

/**
 * Ambiente dos testes: NUNCA herda credenciais reais nem liga o agente ou o envio.
 * Cada teste que precisa de uma variável a define por conta própria (vi.stubEnv).
 */
const VARIAVEIS_SENSIVEIS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_EMAILS",
  "ADMIN_SESSION_SECRET",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "WHATSAPP_NUMERO_CASA",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_AGENT_ENABLED",
  "WHATSAPP_SEND_ENABLED",
  "WHATSAPP_HUMAN_HANDOFF_ENABLED",
  "META_GRAPH_API_VERSION",
  "META_APP_ID",
  "META_APP_SECRET_PROOF_ENABLED",
  "APP_AMBIENTE",
  "RETENCAO_ENABLED",
];

beforeEach(() => {
  for (const nome of VARIAVEIS_SENSIVEIS) vi.stubEnv(nome, "");
  // Rede real proibida: qualquer fetch que um teste não tenha simulado explode em vez de sair para a internet.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      throw new Error(`Rede bloqueada nos testes: ${String(url)}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
