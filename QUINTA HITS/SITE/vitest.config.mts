import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": raiz("./src"),
      // `server-only` lança erro fora do servidor do Next; nos testes ele vira um módulo vazio.
      "server-only": raiz("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Os testes de banco carregam o schema num PostgreSQL em memória; dão folga ao arranque.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Nenhum teste pode depender de credenciais reais nem de rede: o ambiente é limpo em tests/setup.ts.
    setupFiles: ["./tests/setup.ts"],
  },
});
