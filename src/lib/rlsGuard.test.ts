import { describe, it, expect } from "vitest"

import { verificarRolNoSalteaRls, type EjecutorConsultaRol } from "@/lib/rlsGuard"

describe("verificarRolNoSalteaRls", () => {
  it("rechaza un rol con BYPASSRLS", async () => {
    const doble: EjecutorConsultaRol = async () => [
      { rolbypassrls: true, rolsuper: false },
    ]

    await expect(verificarRolNoSalteaRls(doble)).rejects.toThrow(/BYPASSRLS/)
  })

  it("rechaza un rol superusuario aunque no tenga BYPASSRLS", async () => {
    const doble: EjecutorConsultaRol = async () => [
      { rolbypassrls: false, rolsuper: true },
    ]

    await expect(verificarRolNoSalteaRls(doble)).rejects.toThrow(/superusuario/)
  })

  it("rechaza cuando la consulta no devuelve ninguna fila", async () => {
    const doble: EjecutorConsultaRol = async () => []

    await expect(verificarRolNoSalteaRls(doble)).rejects.toThrow(
      /no devolvió ninguna fila/,
    )
  })

  it("deja pasar un rol sin BYPASSRLS y sin ser superusuario", async () => {
    const doble: EjecutorConsultaRol = async () => [
      { rolbypassrls: false, rolsuper: false },
    ]

    await expect(verificarRolNoSalteaRls(doble)).resolves.toBeUndefined()
  })
})
