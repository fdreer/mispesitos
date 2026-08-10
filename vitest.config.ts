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
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
