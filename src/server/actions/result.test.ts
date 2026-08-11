import { describe, expect, it } from "vitest"

import { failure, success } from "@/server/actions/result"

/**
 * El tipo de resultado común de todas las Server Actions. No pega contra la
 * base ni necesita el servidor de Next: es la forma del objeto que los
 * formularios leen con `useActionState`, y toda la cobertura de las acciones en
 * src/server/actions/actions.db.test.ts se apoya en que esa forma sea exacta.
 */
describe("ActionResult", () => {
  it("un éxito lleva ok en true y nada más", () => {
    // El formulario ramifica sólo por `ok`. Que el éxito no arrastre un
    // `message` es lo que hace que ese chequeo alcance.
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
    // Son los que el formulario usa para marcar el input equivocado: si se
    // aplanaran o se perdieran, el usuario vería el cartel general y ningún
    // campo señalado.
    const errores = { date: ["Elegí una fecha válida."], amountCents: ["Escribí un importe válido."] }

    expect(failure("Revisá los datos.", errores)).toEqual({
      ok: false,
      message: "Revisá los datos.",
      fieldErrors: errores,
    })
  })
})
