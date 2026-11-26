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

export const sqlClient = postgres(connectionString, { prepare: false })

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
