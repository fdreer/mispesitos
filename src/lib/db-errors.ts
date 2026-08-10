/**
 * ¿Este error de la base es una violación del índice/constraint único
 * `constraintName`? Devuelve `false` ante cualquier otro error —conexión
 * caída, rechazo de RLS, timeout—, para que el llamador sólo dé el mensaje de
 * "nombre repetido" cuando de verdad es eso y no oculte todo lo demás detrás
 * del mismo texto.
 *
 * Cómo llega el 23505 hasta acá (comprobado a mano contra la base real, no de
 * memoria — ver .superpowers/sdd/task-16-report.md):
 * - postgres.js arma un `PostgresError` con las columnas del mensaje de error
 *   de Postgres ya parseadas como propiedades: `code` es el SQLSTATE
 *   ("23505" para unique_violation, "23503" para foreign_key_violation, etc.)
 *   y `constraint_name` es el nombre del constraint/índice que lo rechazó.
 * - Drizzle NO deja pasar ese error tal cual: lo envuelve en un
 *   `DrizzleQueryError` cuyo `message` es "Failed query: …" y cuyo `code`
 *   propio es `undefined`. El `PostgresError` original queda en `cause`.
 *
 * Por eso hay que mirar `error.cause`, no `error`, para encontrar el código.
 */
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error
  if (typeof cause !== "object" || cause === null) return false

  const { code, constraint_name: constraint } = cause as {
    code?: unknown
    constraint_name?: unknown
  }
  return code === "23505" && constraint === constraintName
}
