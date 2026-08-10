import "server-only"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "@/db/schema"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completalo.")
}

/**
 * `prepare: false` es obligatorio contra el transaction pooler de Supabase:
 * pgbouncer en modo transacción no soporta prepared statements con nombre.
 */
export const sqlClient = postgres(connectionString, { prepare: false })

export const db = drizzle(sqlClient, { schema })

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Abre una transacción, declara ante Postgres qué usuario está consultando y
 * baja el rol a `authenticated` para que las policies de RLS apliquen.
 *
 * TODA lectura y escritura de datos del usuario pasa por acá. El userId viene
 * de la sesión ya verificada por better-auth: no hay que emitir ni validar
 * ningún token adicional para decirle a la base algo que el servidor ya sabe.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId })
    await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`)
    await tx.execute(sql`SET LOCAL ROLE authenticated`)
    return fn(tx)
  })
}
