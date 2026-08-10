import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Los `*.db.test.ts` pegan contra la base real: van por `pnpm test:db`.
    // Se excluye por sufijo y no por directorio: un test unitario puro que
    // viva bajo src/db/ o src/server/ tiene que correr acá igual.
    exclude: ["**/*.db.test.ts", "**/node_modules/**"],
    /**
     * El default de Vitest son 5 s y hay dos casos pesados que hoy corren en
     * milisegundos pero no tienen ningún margen declarado: la fuerza bruta de
     * `splitAmount` (180.000 combinaciones, 113 ms) y las 720 permutaciones de
     * `usdPosition` (6 ms). En una máquina cargada —un CI compartido, un build
     * en paralelo— un factor 40 sobre 113 ms ya se come los 5 s, y el rojo que
     * sale de ahí no dice nada sobre el código: dice que la máquina estaba
     * ocupada.
     *
     * 20 s es holgura de sobra para los dos y sigue siendo bien menos que los
     * 30 s de `vitest.db.config.ts`, donde cada aserción cuesta un viaje de red
     * a Supabase. Acá no hay red: si un test unitario tarda 20 s, está colgado
     * de verdad y el rojo por tiempo es la respuesta correcta.
     */
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
