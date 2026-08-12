/**
 * Loguea un error de la base sin volcar los valores de la fila.
 *
 * Drizzle envuelve el error de postgres.js en un `DrizzleQueryError` cuyo
 * `message` es `Failed query: insert into … params: <LOS VALORES>`. Pasarle ese
 * objeto entero a `console.error` deja importes y descripciones en los logs del
 * hosting. El `PostgresError` original vive en `cause`, y su propio `message`
 * es el de Postgres ("duplicate key value violates unique constraint …"), que
 * no trae los valores.
 *
 * Mismo camino que recorre `isUniqueViolation` (@/lib/db-errors) para llegar al
 * código, y por el mismo motivo.
 *
 * Alcance: las Server Actions, que son las únicas que envuelven su consulta en
 * un `try`/`catch` y llaman acá. Las de @/server/queries no, así que un fallo
 * durante el render lo loguea Next en crudo, con el dump de la consulta. Ahí
 * los parámetros son ids de usuario y fechas —los INSERT donde los parámetros
 * SON la fila pasan todos por Server Actions—, pero no es esta función la que
 * lo garantiza.
 */

/** Marca del `message` que arma Drizzle para el dump de la consulta. */
const MARCA_QUERY_DUMP = "Failed query:"

export function logDbError(donde: string, error: unknown): void {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error

  if (typeof cause === "object" && cause !== null) {
    const { code, constraint_name: constraint, message } = cause as {
      code?: unknown
      constraint_name?: unknown
      message?: unknown
    }

    // Desenvolver un solo nivel de `cause` es una apuesta sobre cómo drizzle-orm
    // y postgres.js envuelven sus errores HOY (ver el comentario de arriba y
    // task-11-report.md). Si el día de mañana esa apuesta deja de valer —una
    // versión de Drizzle que envuelve dos veces, u otro error en la transacción
    // que llega sin desenvolver— lo que quedó en `message` puede seguir siendo
    // el dump de la consulta con los valores de la fila adentro. Por eso, antes
    // de loguearlo, se lo chequea: si todavía tiene la forma de ese dump, se
    // loguea un placeholder fijo en su lugar. Ante la duda, este helper tiene
    // que fallar hacia loguear de menos, nunca hacia loguear la fila.
    const mensajeSeguro =
      typeof message === "string" && message.startsWith(MARCA_QUERY_DUMP)
        ? "[mensaje omitido: parece el dump de la consulta de Drizzle, no el error de Postgres]"
        : message

    console.error(donde, { code, constraint, message: mensajeSeguro })
    return
  }

  console.error(donde, cause)
}
