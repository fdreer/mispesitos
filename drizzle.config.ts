import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Las migraciones son DDL y corren como `postgres`, el dueño de las tablas.
  // La app usa DATABASE_URL, que apunta a `app_user` — un rol sin BYPASSRLS
  // que a propósito no puede hacer DDL.
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL!,
  },
})
