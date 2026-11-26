/**
 * Deja una base lista para Mis Pesitos, sea Supabase o un Postgres propio.
 * Es idempotente: se puede correr en cada arranque (el compose lo hace).
 *
 *   1. Crea los roles `anon` y `authenticated` si no existen. Supabase los trae
 *      de fábrica; un Postgres común no, y sin ellos la migración 0001 (REVOKE
 *      ... FROM anon, authenticated) y las policies `TO authenticated` de la
 *      0003 fallan. Se crean NOLOGIN: nadie se conecta con ellos, sólo son el
 *      destino de `SET LOCAL ROLE authenticated` dentro de withUser().
 *   2. Aplica las migraciones de ./drizzle con el migrador de drizzle-orm (el
 *      mismo que usa `drizzle-kit migrate`, misma tabla de control), así la
 *      imagen de producción no necesita drizzle-kit.
 *   3. Si viene APP_USER_PASSWORD, le da LOGIN y esa contraseña a `app_user`,
 *      el rol con el que conecta la app. Es el paso que en .env.example figura
 *      como manual: la contraseña no puede vivir en una migración porque esas
 *      se commitean.
 *
 * Conecta con MIGRATION_DATABASE_URL: el dueño de las tablas, el único que
 * puede hacer DDL y crear roles.
 */
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const url = process.env.MIGRATION_DATABASE_URL
if (!url) {
  console.error("Falta MIGRATION_DATABASE_URL (la conexión del dueño de la base).")
  process.exit(1)
}

const appUserPassword = process.env.APP_USER_PASSWORD?.trim() || ""

// ALTER ROLE no acepta parámetros: la contraseña va interpolada en el SQL. Se
// limita a un alfabeto que no necesita escape (el `openssl rand -hex 24` que
// recomienda .env.example entra de sobra) para no tener que escapar nada.
if (appUserPassword && !/^[A-Za-z0-9_-]{16,}$/.test(appUserPassword)) {
  console.error(
    "APP_USER_PASSWORD tiene que tener al menos 16 caracteres y sólo letras, números, '-' o '_'. Generá una con: openssl rand -hex 24",
  )
  process.exit(1)
}

// `prepare: false` por compatibilidad con el transaction pooler de Supabase;
// contra un Postgres directo no cambia nada.
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })

try {
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END
    $$;
  `)
  console.log("✓ Roles anon y authenticated presentes")

  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" })
  console.log("✓ Migraciones aplicadas")

  if (appUserPassword) {
    await sql.unsafe(`ALTER ROLE app_user LOGIN PASSWORD '${appUserPassword}'`)
    console.log("✓ app_user con LOGIN y contraseña")
  } else {
    console.log("· APP_USER_PASSWORD vacía: no se tocó la contraseña de app_user")
  }
} catch (error) {
  console.error("✗ No se pudo preparar la base:", error)
  process.exitCode = 1
} finally {
  await sql.end()
}
