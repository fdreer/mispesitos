import "server-only"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { verificarRolNoSalteaRls, type EjecutorConsultaRol } from "@/lib/rlsGuard"
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
 * de falla silencioso es la razón de esta verificación. También cubre el rol
 * superusuario (rolsuper): en Supabase no muerde porque su `postgres` no lo es,
 * pero contra un Postgres local o self-hosted un superusuario saltea RLS igual
 * que BYPASSRLS.
 *
 * La consulta en sí vive acá, que es quien tiene `db`. Qué hacer con lo que
 * devuelve —rechazar por BYPASSRLS, por rolsuper, o porque no vino ninguna
 * fila— es una decisión pura que vive en @/lib/rlsGuard, separada para poder
 * probarla con un doble sin pegarle a la base ni arrastrar el "server-only" de
 * este archivo a la suite unitaria.
 *
 * Se memoiza la promesa para que sea una consulta por vida del proceso, no una
 * por request. Si falla, se limpia el memo: un error de red no puede dejar el
 * proceso envenenado para siempre. Un rol con BYPASSRLS vuelve a fallar en el
 * siguiente intento, que es exactamente lo que se quiere.
 */
let verificacionDeRol: Promise<void> | undefined

const ejecutarConsultaRolReal: EjecutorConsultaRol = async () => {
  const filas = await db.execute(
    sql`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
  )
  return [...filas] as { rolbypassrls: boolean; rolsuper: boolean }[]
}

/**
 * El ejecutor es inyectable y con el ejecutor real como default: withUser()
 * sigue llamando esta función sin argumentos, igual que antes de separar la
 * verificación en @/lib/rlsGuard.
 */
async function consultarRolDeConexion(
  ejecutarConsulta: EjecutorConsultaRol = ejecutarConsultaRolReal,
): Promise<void> {
  await verificarRolNoSalteaRls(ejecutarConsulta)
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
