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
 */
export function logDbError(donde: string, error: unknown): void {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error

  if (typeof cause === "object" && cause !== null) {
    const { code, constraint_name: constraint, message } = cause as {
      code?: unknown
      constraint_name?: unknown
      message?: unknown
    }
    console.error(donde, { code, constraint, message })
    return
  }

  console.error(donde, cause)
}
