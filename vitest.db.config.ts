import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    // Las pruebas comparten filas en una base real: no pueden correr en paralelo.
    fileParallelism: false,
    /**
     * Cada withUser() es una transacción real contra Postgres: sembrar y
     * limpiar un caso completo puede exceder los 10s de default de Vitest en
     * máquinas lentas o contra una base remota. Sólo aplica a los *.db.test.ts:
     * la suite unitaria (vitest.config.ts) conserva los suyos.
     */
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `src/db/client.ts` importa "server-only", cuyo punto de entrada por
      // defecto tira un error a propósito. Next lo resuelve por la condición
      // "react-server" a un módulo vacío; acá se hace lo mismo a mano.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
})
