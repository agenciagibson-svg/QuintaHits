import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // O tsconfig do Next usa jsx "preserve"; nos testes o JSX precisa ser compilado.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": raiz("./src"),
      // `server-only` lança erro fora do servidor do Next; nos testes ele vira um módulo vazio.
      "server-only": raiz("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // Cada arquivo de teste de banco sobe um PostgreSQL em memória (WASM, pesado): rodar arquivos em paralelo
    // estoura a memória. Em sequência, cada um libera o seu antes do próximo.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    // Os testes de banco carregam o schema num PostgreSQL em memória; dão folga ao arranque.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Nenhum teste pode depender de credenciais reais nem de rede: o ambiente é limpo em tests/setup.ts.
    setupFiles: ["./tests/setup.ts"],
  },
});
