import { defineConfig } from "drizzle-kit"

/**
 * FALTA `drizzle/meta/0001_snapshot.json`, Y SE DEJA ASÍ A PROPÓSITO.
 *
 * El journal tiene diez entradas y en `drizzle/meta/` hay nueve snapshots: la
 * 0001 (`0001_rls_tablas_de_auth.sql`) se escribió a mano —es RLS puro, no
 * cambia el esquema— y se agregó al journal sin pasar por `drizzle-kit
 * generate`, que es lo que crea los snapshots.
 *
 * Se verificó qué rompe eso con drizzle-kit 0.31.10: NADA. `check`, `up`,
 * `generate` y `migrate` andan los cuatro. La cadena de snapshots se sigue por
 * `prevId` y está entera: el `prevId` de la 0002 apunta directo al `id` de la
 * 0000. (Comprobado además sacando de prueba un snapshot del medio, el 0005:
 * `check` sigue diciendo "everything's fine", o sea que ni siquiera compara la
 * cantidad de snapshots contra la cantidad de entradas del journal.)
 *
 * Reponerlo no sería gratis: habría que fabricar un snapshot con un `id` nuevo
 * y REESCRIBIR el `prevId` de `0002_snapshot.json`, que es historia ya
 * aplicada, para ganar cero. Si algún día drizzle-kit empieza a exigir un
 * snapshot por entrada, el arreglo es ese; hasta entonces, no se toca.
 */
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
