const MARCA_QUERY_DUMP = "Failed query:"

export function logDbError(donde: string, error: unknown): void {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error

  if (typeof cause === "object" && cause !== null) {
    const { code, constraint_name: constraint, message } = cause as {
      code?: unknown
      constraint_name?: unknown
      message?: unknown
    }

    const mensajeSeguro =
      typeof message === "string" && message.startsWith(MARCA_QUERY_DUMP)
        ? "[mensaje omitido: parece el dump de la consulta de Drizzle, no el error de Postgres]"
        : message

    console.error(donde, { code, constraint, message: mensajeSeguro })
    return
  }

  console.error(donde, cause)
}
