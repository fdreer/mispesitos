export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return isViolation(error, "23505", constraintName)
}

export function isCheckViolation(error: unknown, constraintName: string): boolean {
  return isViolation(error, "23514", constraintName)
}

function isViolation(error: unknown, sqlState: string, constraintName: string): boolean {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error
  if (typeof cause !== "object" || cause === null) return false

  const { code, constraint_name: constraint } = cause as {
    code?: unknown
    constraint_name?: unknown
  }
  return code === sqlState && constraint === constraintName
}
