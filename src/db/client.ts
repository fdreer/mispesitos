import "server-only"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "@/db/schema"

/**
 * DATABASE_URL conecta como `app_user`, NO como el dueño de las tablas. Ese rol
 * no tiene BYPASSRLS, así que las policies de RLS también le aplican fuera de
 * withUser(): una consulta que se olvide de filtrar por usuario devuelve cero
 * filas en vez de devolver datos ajenos. Apuntar esto al rol `postgres` apaga
 * esa segunda capa sin que nada falle a la vista.
 *
 * Las migraciones son otra cadena, MIGRATION_DATABASE_URL, y las lee
 * drizzle.config.ts: necesitan DDL, que `app_user` no tiene.
 */
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
 * Si el rol de conexión tiene BYPASSRLS, las policies no se evalúan y el
 * aislamiento entre usuarios desaparece SIN UN SOLO ERROR: la app anda igual de
 * bien y una consulta que se olvidó de filtrar devuelve datos de todos. Ese modo
 * de falla silencioso es la razón de esta verificación.
 *
 * Se memoiza la promesa para que sea una consulta por vida del proceso, no una
 * por request. Si falla, se limpia el memo: un error de red no puede dejar el
 * proceso envenenado para siempre. Un rol con BYPASSRLS vuelve a fallar en el
 * siguiente intento, que es exactamente lo que se quiere.
 */
let verificacionDeRol: Promise<void> | undefined

async function consultarRolDeConexion(): Promise<void> {
  const filas = await db.execute(
    sql`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  )
  const [fila] = [...filas] as { rolbypassrls: boolean }[]

  if (fila?.rolbypassrls) {
    throw new Error(
      "El rol con el que la app conecta a la base tiene BYPASSRLS: las policies de " +
        "RLS no se evalúan, así que cualquier consulta que se olvide de filtrar por " +
        "usuario devuelve datos de todos los usuarios y nada falla a la vista. " +
        "DATABASE_URL tiene que ser la cadena del rol de aplicación (`app_user`), no " +
        "la del dueño (`postgres`). La del dueño va únicamente en " +
        "MIGRATION_DATABASE_URL, que es la que usan las migraciones.",
    )
  }
}

function verificarRolSinBypassRls(): Promise<void> {
  const enCurso =
    verificacionDeRol ??
    consultarRolDeConexion().catch((error: unknown) => {
      verificacionDeRol = undefined
      throw error
    })

  verificacionDeRol = enCurso
  return enCurso
}

/**
 * Abre una transacción, declara ante Postgres qué usuario está consultando y
 * baja el rol a `authenticated` para que las policies de RLS apliquen.
 *
 * TODA lectura y escritura de datos del usuario pasa por acá. El userId viene
 * de la sesión ya verificada por better-auth: no hay que emitir ni validar
 * ningún token adicional para decirle a la base algo que el servidor ya sabe.
 *
 * OJO CON LAS TABLAS DE AUTH. Adentro de acá el rol es `authenticated`, y la
 * migración 0001 le revoca todo sobre `user`, `session` y `account`: cualquier
 * consulta que joinee contra esas tablas desde adentro de withUser muere con
 * *permission denied*. Los datos del usuario logueado se leen antes, con
 * better-auth, y se pasan como argumento.
 */
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
