import { readFileSync } from "node:fs"
import { join } from "node:path"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// Contraseña fija que usaba docker-compose.yml antes de que los secretos se
// generaran solos. Una base inicializada con ella se rota sola a la nueva.
const LEGACY_POSTGRES_PASSWORD = "mispesitos_postgres_local_only"

const secretsDir = process.env.SECRETS_DIR || "/secrets"

function readSecret(name) {
  try {
    return readFileSync(join(secretsDir, name), "utf8").trim()
  } catch {
    return ""
  }
}

function superuserUrl(password) {
  const host = process.env.DB_HOST || "db"
  const port = process.env.DB_PORT || "5432"
  const name = process.env.DB_NAME || "mispesitos"
  return `postgresql://postgres:${encodeURIComponent(password)}@${host}:${port}/${name}`
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`
}

// Fuera de Docker (`pnpm db:setup`) manda MIGRATION_DATABASE_URL. En Docker se
// arma con la contraseña de POSTGRES_PASSWORD o del archivo de init-secrets.
const explicitUrl = process.env.MIGRATION_DATABASE_URL
const postgresPassword = explicitUrl
  ? ""
  : process.env.POSTGRES_PASSWORD?.trim() || readSecret("postgres-password")

if (!explicitUrl && !postgresPassword) {
  console.error(
    `Falta la conexión del dueño de la base: definí MIGRATION_DATABASE_URL o POSTGRES_PASSWORD, o generá ${secretsDir}/postgres-password con scripts/init-secrets.mjs.`,
  )
  process.exit(1)
}

const appUserPassword = process.env.APP_USER_PASSWORD?.trim() || readSecret("app-user-password")

if (appUserPassword && !/^[A-Za-z0-9_-]{16,}$/.test(appUserPassword)) {
  console.error(
    "APP_USER_PASSWORD tiene que tener al menos 16 caracteres y sólo letras, números, '-' o '_'. Generá una con: openssl rand -hex 24",
  )
  process.exit(1)
}

function open(url) {
  return postgres(url, { prepare: false, max: 1, onnotice: () => {} })
}

async function connect() {
  const sql = open(explicitUrl || superuserUrl(postgresPassword))
  try {
    await sql`SELECT 1`
    return sql
  } catch (error) {
    await sql.end()
    const authFailed = error?.code === "28P01"
    if (explicitUrl || !authFailed || postgresPassword === LEGACY_POSTGRES_PASSWORD) throw error

    const legacy = open(superuserUrl(LEGACY_POSTGRES_PASSWORD))
    try {
      await legacy`SELECT 1`
    } catch {
      await legacy.end()
      throw error
    }
    await legacy.unsafe(`ALTER ROLE postgres PASSWORD ${quoteLiteral(postgresPassword)}`)
    console.log("✓ La base usaba la contraseña por defecto de versiones anteriores: rotada a la generada")
    return legacy
  }
}

let sql
try {
  sql = await connect()

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
    await sql.unsafe(`ALTER ROLE app_user LOGIN PASSWORD ${quoteLiteral(appUserPassword)}`)
    console.log("✓ app_user con LOGIN y contraseña")
  } else {
    console.log("· APP_USER_PASSWORD vacía: no se tocó la contraseña de app_user")
  }
} catch (error) {
  console.error("✗ No se pudo preparar la base:", error)
  process.exitCode = 1
} finally {
  await sql?.end()
}
