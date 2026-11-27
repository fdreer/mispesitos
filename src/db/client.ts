import "server-only"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { verificarRolNoSalteaRls, type EjecutorConsultaRol } from "@/lib/rls-guard"
import * as schema from "@/db/schema"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completalo.")
}

/** Un entero positivo de una variable de entorno, o el default si no está o no es válido. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function createSqlClient(url: string) {
  return postgres(url, {
    max: envInt("DATABASE_POOL_MAX", 10),
    // Segundos. Las conexiones ociosas se cierran: un proceso de larga vida no
    // retiene conexiones que Postgres podría necesitar para otro.
    idle_timeout: envInt("DATABASE_IDLE_TIMEOUT", 20),
    connect_timeout: envInt("DATABASE_CONNECT_TIMEOUT", 10),
    // Prepared statements activados por defecto (Postgres directo, sin
    // pooler). `DATABASE_PREPARE=false` sólo hace falta detrás de PgBouncer en
    // modo transaction, que no los soporta.
    prepare: process.env.DATABASE_PREPARE !== "false",
  })
}

/*
 * En desarrollo cada recarga de HMR vuelve a evaluar este módulo: sin guardar
 * el cliente en `globalThis`, cada recarga abría un pool nuevo y dejaba el
 * anterior con sus conexiones vivas hasta agotar `max_connections`.
 */
const globalForDb = globalThis as typeof globalThis & {
  __mispesitosSql?: ReturnType<typeof createSqlClient>
}

export const sqlClient = globalForDb.__mispesitosSql ?? createSqlClient(connectionString)
// Sólo en desarrollo: en tests cada archivo cierra su cliente con `end()`, y
// heredar uno cerrado por `globalThis` rompería el siguiente.
if (process.env.NODE_ENV === "development") globalForDb.__mispesitosSql = sqlClient

export const db = drizzle(sqlClient, { schema })

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

let verificacionDeRol: Promise<void> | undefined

const ejecutarConsultaRolReal: EjecutorConsultaRol = async () => {
  const filas = await db.execute(
    sql`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
  )
  return [...filas] as { rolbypassrls: boolean; rolsuper: boolean }[]
}

function verificarRolSinBypassRls(): Promise<void> {
  const enCurso =
    verificacionDeRol ??
    verificarRolNoSalteaRls(ejecutarConsultaRolReal).catch((error: unknown) => {
      verificacionDeRol = undefined
      throw error
    })

  verificacionDeRol = enCurso
  return enCurso
}

export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  await verificarRolSinBypassRls()

  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId })
    await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`)
    await tx.execute(sql`SET LOCAL ROLE authenticated`)
    return fn(tx)
  })
}
