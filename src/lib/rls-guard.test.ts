import { describe, it, expect } from "vitest"

import {
  verificarRolNoSalteaRls,
  type EjecutorConsultaRol,
  type FilaRolPg,
} from "@/lib/rls-guard"

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

  it("rechaza un rol que es superusuario Y tiene BYPASSRLS, nombrando el motivo más grave", async () => {
    const doble: EjecutorConsultaRol = async () => [
      { rolbypassrls: true, rolsuper: true },
    ]

    await expect(verificarRolNoSalteaRls(doble)).rejects.toThrow(/superusuario/)
  })

  it("rechaza cuando la fila no trae los atributos como booleanos", async () => {
    // Una columna renombrada en la consulta, un driver que devuelve otra forma:
    // con `undefined` el `||` da falsy y la verificación dejaría pasar la
    // conexión sin haber confirmado nada. Falla cerrado.
    const filas: FilaRolPg[] = [
      { rolbypassrls: undefined, rolsuper: undefined },
      { rolbypassrls: false, rolsuper: undefined },
      { rolbypassrls: undefined, rolsuper: false },
      { rolbypassrls: "f", rolsuper: "f" },
      { rolbypassrls: 0, rolsuper: 0 },
      { rolbypassrls: null, rolsuper: null },
    ]

    for (const fila of filas) {
      await expect(verificarRolNoSalteaRls(async () => [fila])).rejects.toThrow(
        /sin los atributos booleanos esperados/,
      )
    }
  })

  it("rechaza cuando la consulta devuelve algo que no es una fila", async () => {
    const doble = (async () => [null]) as unknown as EjecutorConsultaRol

    await expect(verificarRolNoSalteaRls(doble)).rejects.toThrow()
  })

  it("deja pasar un rol sin BYPASSRLS y sin ser superusuario", async () => {
    const doble: EjecutorConsultaRol = async () => [
      { rolbypassrls: false, rolsuper: false },
    ]

    await expect(verificarRolNoSalteaRls(doble)).resolves.toBeUndefined()
  })

  it("si la consulta falla, el error sale para arriba y no se lo toma como que el rol está bien", async () => {
    const doble: EjecutorConsultaRol = async () => {
      throw new Error("conexión rechazada")
    }

    await expect(verificarRolNoSalteaRls(doble)).rejects.toThrow(/conexión rechazada/)
  })
})
