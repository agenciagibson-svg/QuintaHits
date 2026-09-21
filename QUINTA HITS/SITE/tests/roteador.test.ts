import { describe, expect, it, vi } from "vitest";
import { extrairEventos } from "@/lib/whatsappEventos";
import { classificarDestino } from "@/lib/agente/roteador";
import {
  PHONE_NUMBER_ID_QUINTA_HITS,
  agenteLigadoPorEnv,
  ambienteAtual,
  envioLigadoPorEnv,
  idParaEnvio,
  idQuintaHitsParaRoteamento,
  repasseHumanoLigadoPorEnv,
  versaoGraphApi,
} from "@/lib/agente/ambiente";
import { corpoMensagem, corpoStatus, ID_OUTRO_NUMERO, ID_QUINTA_HITS } from "./helpers/whatsapp";

describe("extrairEventos", () => {
  it("lê mensagem de texto com phone_number_id, wamid, nome do perfil e horário da Meta", () => {
    const [ev] = extrairEventos(JSON.parse(corpoMensagem({ wamid: "wamid.A", texto: "Quero reservar", nome: "Ana", timestamp: 1_800_000_000 })));
    expect(ev).toMatchObject({ tipo: "mensagem", phoneNumberId: ID_QUINTA_HITS, wamid: "wamid.A", de: "5534999998888", nomePerfil: "Ana", enviadaEm: 1_800_000_000_000, conteudo: { forma: "texto", texto: "Quero reservar" } });
  });

  it("lê resposta de botão e de lista", () => {
    const [b] = extrairEventos(JSON.parse(corpoMensagem({ interativo: { id: "reservar", titulo: "Reservar mesa" } })));
    const [l] = extrairEventos(JSON.parse(corpoMensagem({ interativo: { id: "mesa:abc", titulo: "Mesa 4", lista: true } })));
    expect(b.tipo === "mensagem" && b.conteudo).toEqual({ forma: "resposta_interativa", id: "reservar", titulo: "Reservar mesa" });
    expect(l.tipo === "mensagem" && l.conteudo).toEqual({ forma: "resposta_interativa", id: "mesa:abc", titulo: "Mesa 4" });
  });

  it("imagem, áudio e outros tipos viram 'nao_suportado' (sem conteúdo)", () => {
    const [ev] = extrairEventos(JSON.parse(corpoMensagem({ tipo: "image" })));
    expect(ev.tipo === "mensagem" && ev.conteudo).toEqual({ forma: "nao_suportado", tipoMeta: "image" });
  });

  it("lê atualização de status, com código de erro quando houver", () => {
    const [ok] = extrairEventos(JSON.parse(corpoStatus({ wamid: "wamid.S", status: "read" })));
    const [falha] = extrairEventos(JSON.parse(corpoStatus({ status: "failed", erroCodigo: 131047 })));
    expect(ok).toMatchObject({ tipo: "status", phoneNumberId: ID_QUINTA_HITS, wamid: "wamid.S", status: "read", erroCodigo: null });
    expect(falha).toMatchObject({ tipo: "status", status: "failed", erroCodigo: "131047" });
  });

  it("sem metadata.phone_number_id, o evento vem com phoneNumberId nulo", () => {
    const [ev] = extrairEventos(JSON.parse(corpoMensagem({ phoneNumberId: null })));
    expect(ev.phoneNumberId).toBeNull();
  });

  it("ignora com segurança lixo, tipos errados e estruturas parciais", () => {
    for (const lixo of [null, undefined, 42, "texto", [], {}, { entry: "x" }, { entry: [null, 5, { changes: "x" }, { changes: [{ value: null }] }] }, { entry: [{ changes: [{ value: { messages: [{ id: "x" }] } }] }] }]) {
      expect(() => extrairEventos(lixo)).not.toThrow();
      expect(extrairEventos(lixo)).toEqual([]);
    }
  });

  it("vários números no mesmo callback: cada evento leva o ID do número que o recebeu", () => {
    const corpo = {
      entry: [
        { changes: [{ value: { metadata: { phone_number_id: ID_QUINTA_HITS }, messages: [{ from: "551", id: "a", type: "text", text: { body: "x" } }] } }] },
        { changes: [{ value: { metadata: { phone_number_id: ID_OUTRO_NUMERO }, messages: [{ from: "552", id: "b", type: "text", text: { body: "y" } }] } }] },
      ],
    };
    expect(extrairEventos(corpo).map((e) => e.phoneNumberId)).toEqual([ID_QUINTA_HITS, ID_OUTRO_NUMERO]);
  });
});

describe("classificarDestino", () => {
  it("só o ID esperado é da QUINTA HITS; qualquer outro ou ausente é ignorado", () => {
    expect(classificarDestino(ID_QUINTA_HITS, ID_QUINTA_HITS)).toBe("quinta_hits");
    expect(classificarDestino(ID_OUTRO_NUMERO, ID_QUINTA_HITS)).toBe("ignorado_outro_numero");
    expect(classificarDestino(null, ID_QUINTA_HITS)).toBe("ignorado_sem_numero");
    expect(classificarDestino("", ID_QUINTA_HITS)).toBe("ignorado_sem_numero");
  });

  it("configuração insegura (ID esperado nulo): NADA é da QUINTA HITS", () => {
    expect(classificarDestino(ID_QUINTA_HITS, null)).toBe("ignorado_outro_numero");
  });
});

describe("ambiente e interruptores", () => {
  it("tudo nasce DESLIGADO: ausente, vazio ou diferente de 'true' desliga o agente e o envio", () => {
    expect(agenteLigadoPorEnv()).toBe(false);
    expect(envioLigadoPorEnv()).toBe(false);
    for (const v of ["", "false", "0", "yes", "sim", "TRUEISH"]) {
      vi.stubEnv("WHATSAPP_AGENT_ENABLED", v);
      vi.stubEnv("WHATSAPP_SEND_ENABLED", v);
      expect(agenteLigadoPorEnv()).toBe(false);
      expect(envioLigadoPorEnv()).toBe(false);
    }
    // Modo estrito: só o texto exato "true" liga (maiúsculas ou espaços = desligado).
    for (const v of [" TRUE ", "TRUE", "True", " true", "true "]) {
      vi.stubEnv("WHATSAPP_AGENT_ENABLED", v);
      expect(agenteLigadoPorEnv(), JSON.stringify(v)).toBe(false);
    }
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    expect(agenteLigadoPorEnv()).toBe(true);
  });

  it("repasse humano nasce LIGADO e só desliga com 'false'", () => {
    expect(repasseHumanoLigadoPorEnv()).toBe(true);
    vi.stubEnv("WHATSAPP_HUMAN_HANDOFF_ENABLED", "false");
    expect(repasseHumanoLigadoPorEnv()).toBe(false);
  });

  it("produção é o padrão estrito; só 'homologacao' muda o modo", () => {
    expect(ambienteAtual()).toBe("producao");
    vi.stubEnv("APP_AMBIENTE", "qualquer-coisa");
    expect(ambienteAtual()).toBe("producao");
    vi.stubEnv("APP_AMBIENTE", "homologacao");
    expect(ambienteAtual()).toBe("homologacao");
  });

  it("produção: o roteamento usa SEMPRE o ID oficial (não depende da variável)", () => {
    expect(idQuintaHitsParaRoteamento()).toBe(PHONE_NUMBER_ID_QUINTA_HITS);
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_OUTRO_NUMERO);
    expect(idQuintaHitsParaRoteamento()).toBe(PHONE_NUMBER_ID_QUINTA_HITS);
  });

  it("produção: só se envia se a variável for EXATAMENTE o ID oficial (nunca por outro número)", () => {
    expect(idParaEnvio()).toBeNull();
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_OUTRO_NUMERO);
    expect(idParaEnvio()).toBeNull();
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ` ${PHONE_NUMBER_ID_QUINTA_HITS} `);
    expect(idParaEnvio()).toBe(PHONE_NUMBER_ID_QUINTA_HITS);
  });

  it("homologação: usa o ID do número de TESTE e recusa o ID de produção", () => {
    vi.stubEnv("APP_AMBIENTE", "homologacao");
    expect(idQuintaHitsParaRoteamento()).toBeNull();
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1029384756");
    expect(idQuintaHitsParaRoteamento()).toBe("1029384756");
    expect(idParaEnvio()).toBe("1029384756");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", PHONE_NUMBER_ID_QUINTA_HITS);
    expect(idQuintaHitsParaRoteamento()).toBeNull();
    expect(idParaEnvio()).toBeNull();
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "abc");
    expect(idQuintaHitsParaRoteamento()).toBeNull();
  });

  it("versão da Graph API: padrão v21.0; variável válida sobrescreve; inválida é ignorada", () => {
    expect(versaoGraphApi()).toBe("v21.0");
    vi.stubEnv("META_GRAPH_API_VERSION", "v23.0");
    expect(versaoGraphApi()).toBe("v23.0");
    vi.stubEnv("META_GRAPH_API_VERSION", "23");
    expect(versaoGraphApi()).toBe("v21.0");
  });
});
