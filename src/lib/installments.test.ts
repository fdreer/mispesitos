import { describe, it, expect } from "vitest"
import {
  splitAmount,
  buildInstallments,
  installmentsSumMatches,
} from "@/lib/installments"

describe("splitAmount", () => {
  it("divide exacto cuando no hay resto", () => {
    expect(splitAmount(12_000, 4)).toEqual([3_000, 3_000, 3_000, 3_000])
  })

  it("deja el resto en la última cuota", () => {
    // $100,00 en 3 => 33,33 / 33,33 / 33,34
    expect(splitAmount(10_000, 3)).toEqual([3_333, 3_333, 3_334])
  })

  it("la suma siempre cierra contra el total", () => {
    for (const total of [1, 7, 99, 10_000, 123_457, 999_999_99]) {
      for (const count of [1, 2, 3, 6, 12, 24]) {
        const parts = splitAmount(total, count)
        expect(parts).toHaveLength(count)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })

  it("la suma cierra por fuerza bruta: 180.000 combinaciones de total y cuotas", () => {
    // La invariante más cara de la app —si se pierde un centavo, el
    // movimiento queda inconsistente contra sus cuotas para siempre— revisada
    // exhaustivamente, no sobre una muestra elegida a dedo. Cubre a propósito
    // los totales con menos centavos que cuotas (el reparto da cuotas de cero)
    // y cantidades de cuotas mucho más grandes que las 120 que permite el
    // formulario.
    //
    // Las fallas se juntan en una lista y se comparan una sola vez contra la
    // lista vacía: 180.000 llamadas a expect() dentro del bucle tardan minutos
    // y no dicen nada más que esto.
    const fallas: string[] = []

    for (let total = 0; total < 600; total++) {
      for (let count = 1; count <= 300; count++) {
        const parts = splitAmount(total, count)
        const suma = parts.reduce((a, b) => a + b, 0)
        // Ninguna cuota puede salir negativa ni por encima del total: un
        // reparto que "cierre" a fuerza de una cuota negativa no sirve.
        const partesSanas = parts.every(
          (p) => Number.isInteger(p) && p >= 0 && p <= total,
        )

        if (parts.length !== count || suma !== total || !partesSanas) {
          fallas.push(`${total} en ${count} => ${JSON.stringify(parts)}`)
        }
      }
    }

    expect(fallas).toEqual([])
  })

  it("un total de un centavo se lo lleva entero la última cuota", () => {
    expect(splitAmount(1, 3)).toEqual([0, 0, 1])
    expect(splitAmount(1, 1)).toEqual([1])
  })

  it("un total de cero reparte ceros", () => {
    expect(splitAmount(0, 4)).toEqual([0, 0, 0, 0])
  })

  it("con menos centavos que cuotas, las primeras van en cero", () => {
    // Pasa de verdad: $0,05 en 12 cuotas. Todas menos la última quedan en cero.
    expect(splitAmount(5, 12)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5])
  })

  it("una sola cuota es el total entero", () => {
    expect(splitAmount(10_000, 1)).toEqual([10_000])
  })

  it("rechaza cantidades de cuota inválidas", () => {
    expect(() => splitAmount(10_000, 0)).toThrow()
    expect(() => splitAmount(10_000, -1)).toThrow()
  })

  it("rechaza una cantidad de cuotas que no es un entero", () => {
    // Sin esto, `new Array(2.5)` tira RangeError y el usuario ve un error de
    // JavaScript en vez del mensaje del formulario.
    expect(() => splitAmount(10_000, 2.5)).toThrow(/entero mayor a cero/)
    expect(() => splitAmount(10_000, Number.NaN)).toThrow(/entero mayor a cero/)
    expect(() => splitAmount(10_000, Number.POSITIVE_INFINITY)).toThrow(/entero mayor a cero/)
  })

  it("rechaza totales negativos", () => {
    expect(() => splitAmount(-100, 2)).toThrow()
  })

  it("rechaza un total que no es un entero de centavos", () => {
    // La plata son centavos enteros. Un total con decimales repartiría cuotas
    // con decimales, que la columna `bigint` de la base no puede guardar.
    expect(() => splitAmount(100.5, 2)).toThrow(/entero de centavos no negativo/)
    expect(() => splitAmount(Number.NaN, 2)).toThrow(/entero de centavos no negativo/)
  })
})

describe("buildInstallments", () => {
  it("genera vencimientos mensuales numerados desde 1", () => {
    const result = buildInstallments(30_000, 3, "2026-08-10")
    expect(result).toEqual([
      { number: 1, amountCents: 10_000, dueDate: "2026-08-10" },
      { number: 2, amountCents: 10_000, dueDate: "2026-09-10" },
      { number: 3, amountCents: 10_000, dueDate: "2026-10-10" },
    ])
  })

  it("recorta el día cuando el mes destino es más corto", () => {
    const result = buildInstallments(20_000, 2, "2026-01-31")
    expect(result.map((i) => i.dueDate)).toEqual(["2026-01-31", "2026-02-28"])
  })

  it("un movimiento de contado es la cuota 1 de 1", () => {
    const result = buildInstallments(55_000, 1, "2026-08-09")
    expect(result).toEqual([
      { number: 1, amountCents: 55_000, dueDate: "2026-08-09" },
    ])
  })

  it("el plan que genera siempre cierra contra el total y la suma lo confirma", () => {
    // Las dos piezas atadas: lo que arma el formulario tiene que pasar la
    // validación que hace el esquema de la Server Action.
    for (const total of [1, 5, 100, 12_345, 999_999_99]) {
      for (const count of [1, 2, 3, 7, 12, 24, 120]) {
        const plan = buildInstallments(total, count, "2026-01-31")
        expect(installmentsSumMatches(total, plan.map((i) => i.amountCents))).toBe(true)
        expect(plan.map((i) => i.number)).toEqual(
          Array.from({ length: count }, (_, i) => i + 1),
        )
      }
    }
  })

  it("120 cuotas desde un 31 recortan cada mes corto y no repiten vencimiento seguido", () => {
    // El máximo que permite el formulario, arrancando del peor día posible.
    const plan = buildInstallments(120_000, 120, "2026-01-31")

    expect(plan).toHaveLength(120)
    expect(plan[1].dueDate).toBe("2026-02-28")
    expect(plan[2].dueDate).toBe("2026-03-31")
    expect(plan[3].dueDate).toBe("2026-04-30")
    // Diez años más tarde, mismo día del mes que la primera.
    expect(plan[119].dueDate).toBe("2035-12-31")
    // Cada vencimiento cae en un mes distinto y en orden: ningún mes repetido
    // ni salteado por el recorte de días.
    const meses = plan.map((i) => i.dueDate.slice(0, 7))
    expect(new Set(meses).size).toBe(120)
    expect([...meses].sort()).toEqual(meses)
  })

  it("un vencimiento inicial que no existe se rechaza en vez de correrse solo", () => {
    expect(() => buildInstallments(10_000, 3, "2026-02-30")).toThrow()
  })
})

describe("installmentsSumMatches", () => {
  it("acepta cuando la suma cierra", () => {
    expect(installmentsSumMatches(10_000, [3_333, 3_333, 3_334])).toBe(true)
  })

  it("rechaza cuando falta o sobra un centavo", () => {
    expect(installmentsSumMatches(10_000, [3_333, 3_333, 3_333])).toBe(false)
    expect(installmentsSumMatches(10_000, [3_334, 3_333, 3_334])).toBe(false)
  })

  it("rechaza una lista vacía", () => {
    expect(installmentsSumMatches(10_000, [])).toBe(false)
  })
})
