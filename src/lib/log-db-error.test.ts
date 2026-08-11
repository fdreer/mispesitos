import { describe, it, expect, vi, afterEach } from "vitest"

import { logDbError } from "@/lib/log-db-error"

/**
 * Arma un `DrizzleQueryError` como el que arma Drizzle de verdad: `message`
 * es el dump completo de la consulta con sus params adentro, y la causa
 * real —el `PostgresError` de postgres.js— vive en `cause`. Mismo shape que
 * usa `db-errors.test.ts` para `isUniqueViolation`.
 */
function drizzleQueryError(mensajeQuery: string, cause: unknown): Error {
  const error = new Error(mensajeQuery)
  Object.assign(error, { cause })
  return error
}

const dumpDeLaConsulta =
  'Failed query: insert into "movement" ("id", "amount_cents", "description") values ($1, $2, $3) params: 150000, Alquiler de marzo'

describe("logDbError", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("desenvuelve el cause y loguea el error de Postgres, nunca los valores de la fila", () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {})

    const error = drizzleQueryError(dumpDeLaConsulta, {
      code: "23505",
      constraint_name: "movement_external_id_unique",
      message: 'duplicate key value violates unique constraint "movement_external_id_unique"',
    })

    logDbError("createMovement", error)

    expect(espia).toHaveBeenCalledTimes(1)
    const [donde, detalle] = espia.mock.calls[0]
    expect(donde).toBe("createMovement")
    expect(detalle).toMatchObject({
      code: "23505",
      constraint: "movement_external_id_unique",
      message: 'duplicate key value violates unique constraint "movement_external_id_unique"',
    })

    // La aserción que importa: ni un valor de la fila ni el propio marcador
    // "params:" pueden aparecer en NINGUNA parte de lo que se logueó, esté
    // donde esté anidado.
    const volcado = JSON.stringify(espia.mock.calls)
    expect(volcado).not.toContain("Alquiler de marzo")
    expect(volcado).not.toContain("150000")
    expect(volcado).not.toContain("params:")
  })

  it("si no hay cause para desenvolver (Drizzle envuelve dos veces, u otra versión), no deja pasar el dump de la consulta", () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {})

    // Sin `cause`: el helper usa el error tal cual, y su `message` sigue
    // siendo el dump con los params adentro. Este es el caso exacto que
    // motiva el guard —si se lo saca, esta prueba tiene que fallar.
    const error = new Error(dumpDeLaConsulta)

    logDbError("createMovement", error)

    const volcado = JSON.stringify(espia.mock.calls)
    expect(volcado).not.toContain("Alquiler de marzo")
    expect(volcado).not.toContain("150000")
    expect(volcado).not.toContain("params:")
  })

  it("no revienta con un valor que no es un Error (rama fallback: loguea el valor tal cual)", () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {})

    logDbError("createMovement", "boom")

    expect(espia).toHaveBeenCalledWith("createMovement", "boom")
  })
})
