import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const url = process.env.MIGRATION_DATABASE_URL
if (!url) {
  console.error("Falta MIGRATION_DATABASE_URL (la conexión del dueño de la base).")
  process.exit(1)
}

const appUserPassword = process.env.APP_USER_PASSWORD?.trim() || ""

if (appUserPassword && !/^[A-Za-z0-9_-]{16,}$/.test(appUserPassword)) {
  console.error(
    "APP_USER_PASSWORD tiene que tener al menos 16 caracteres y sólo letras, números, '-' o '_'. Generá una con: openssl rand -hex 24",
  )
  process.exit(1)
}

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
