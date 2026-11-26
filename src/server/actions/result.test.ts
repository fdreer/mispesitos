import { describe, expect, it } from "vitest"

import { failure, success } from "@/server/actions/result"

describe("ActionResult", () => {
  it("un éxito lleva ok en true y nada más", () => {
    expect(success()).toEqual({ ok: true })
    expect(Object.keys(success())).toEqual(["ok"])
  })

  it("un rechazo lleva ok en false y el mensaje que se le pasó", () => {
    expect(failure("No pudimos guardar el movimiento. Probá de nuevo.")).toMatchObject({
      ok: false,
      message: "No pudimos guardar el movimiento. Probá de nuevo.",
    })
  })

  it("un rechazo conserva los errores por campo tal cual", () => {
    const errores = { date: ["Elegí una fecha válida."], amountCents: ["Escribí un importe válido."] }

    expect(failure("Revisá los datos.", errores)).toEqual({
      ok: false,
      message: "Revisá los datos.",
      fieldErrors: errores,
    })
  })
})
