import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generado por `pnpm test:coverage` (@vitest/coverage-v8). Ya está en
    // .gitignore; sin esto, lint tropieza con su propio HTML si la carpeta
    // quedó de una corrida anterior.
    "coverage/**",
  ]),
]);

export default eslintConfig;
