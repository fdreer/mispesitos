import { describe, it, expect } from "vitest"
import {
  monthlyTotals,
  projectBalance,
  projectionStartArsCents,
  spendByCategory,
} from "@/lib/dashboard"

/**
 * La proyección aplica cuotas YA convertidas a pesos, así que su punto de
 * partida tiene que estar en esa misma escala. Arrancaba en el saldo en pesos
 * pelado: para alguien con dólares ahorrados, la curva empezaba por debajo de
 * su saldo real y después le descontaba deudas en dólares valuadas en pesos.
 *
 * NO BORRAR NI RELAJAR: si esto se pone en rojo, lo más probable es que el
 * punto de partida haya vuelto a ser sólo pesos.
 */
describe("projectionStartArsCents", () => {
  it("consolida los dólares del saldo con la cotización de hoy", () => {
    expect(
      projectionStartArsCents({ arsCents: 100_000_00, usdCents: 500_00 }, 1_500),
    ).toBe(100_000_00 + 750_000_00)
  })

  it("sin dólares en el saldo, es el saldo en pesos tal cual", () => {
    expect(projectionStartArsCents({ arsCents: 100_000_00, usdCents: 0 }, 1_500)).toBe(
      100_000_00,
    )
  })

  it("sin dólares en el saldo NO necesita cotización: sigue dando el número exacto", () => {
    // El caso de la API caída para quien no tiene dólares. No hay nada que
    // consolidar, así que no hay motivo para dejarlo sin gráfico.
    expect(projectionStartArsCents({ arsCents: 100_000_00, usdCents: 0 }, null)).toBe(
      100_000_00,
    )
  })

  it("con dólares y sin cotización devuelve null en vez de mentir", () => {
    // dolarapi puede fallar o tardar (sección 5.6 del spec). Devolver el saldo
    // en pesos acá sería exactamente el bug de origen: una curva que arranca
    // por debajo del saldo real. Quien llama decide qué mostrar; lo que no
    // puede es recibir un número que no es.
    expect(projectionStartArsCents({ arsCents: 100_000_00, usdCents: 500_00 }, null)).toBeNull()
  })

  it("un saldo en dólares negativo se consolida igual, restando", () => {
    // computeBalances puede dejar el saldo en dólares negativo si se gastó de
    // más: el consolidado tiene que reflejarlo, no clampearlo.
    expect(projectionStartArsCents({ arsCents: 100_000_00, usdCents: -200_00 }, 1_500)).toBe(
      100_000_00 - 300_000_00,
    )
  })

  it("redondea al centavo, sin fabricar fracciones", () => {
    // 3,33 dólares a 1.234,5678 pesos. La conversión es la de @/lib/money, que
    // es la única que multiplica por una cotización en toda la app.
    expect(projectionStartArsCents({ arsCents: 0, usdCents: 3_33 }, 1_234.5678)).toBe(
      Math.round(3_33 * 1_234.5678),
    )
    expect(Number.isInteger(projectionStartArsCents({ arsCents: 0, usdCents: 3_33 }, 1_234.5678))).toBe(
      true,
    )
  })
})

describe("projectBalance", () => {
  it("arranca del saldo de partida y aplica los pendientes por vencimiento", () => {
    const result = projectBalance(
      100_000_00,
      [
        { dueDate: "2026-09-10", arsCents: 30_000_00, kind: "expense" },
        { dueDate: "2026-10-05", arsCents: 50_000_00, kind: "income" },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-08", arsCents: 100_000_00 },
      { month: "2026-09", arsCents: 70_000_00 },
      { month: "2026-10", arsCents: 120_000_00 },
    ])
  })

  it("ignora los vencimientos posteriores al horizonte", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2027-05-01", arsCents: 999_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result.at(-1)!.arsCents).toBe(10_000_00)
  })

  it("acumula los vencimientos atrasados en el mes actual", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2026-07-01", arsCents: 4_000_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result[0].arsCents).toBe(6_000_00)
  })

  it("con la lista de pendientes vacía, repite el saldo de partida en todos los meses", () => {
    const result = projectBalance(50_000_00, [], 3, "2026-08-09")

    expect(result).toEqual([
      { month: "2026-08", arsCents: 50_000_00 },
      { month: "2026-09", arsCents: 50_000_00 },
      { month: "2026-10", arsCents: 50_000_00 },
    ])
  })

  it("con hoy en un 31, el horizonte no repite ni saltea ningún mes", () => {
    // El 31 de enero + 1 mes recorta al 28 de febrero. Si el recorte llegara al
    // mes y no sólo al día, el horizonte devolvería febrero dos veces o se
    // saltearía uno, y el gráfico mostraría un mes de más o de menos.
    for (const hoy of ["2026-01-31", "2026-03-31", "2026-05-31", "2028-02-29"]) {
      const meses = projectBalance(0, [], 13, hoy).map((p) => p.month)

      expect(meses).toHaveLength(13)
      expect(new Set(meses).size).toBe(13)
      expect([...meses].sort()).toEqual(meses)
      expect(meses[0]).toBe(hoy.slice(0, 7))
    }
  })

  it("el horizonte cruza el año", () => {
    const result = projectBalance(
      10_000_00,
      [
        { dueDate: "2026-12-20", arsCents: 1_000_00, kind: "expense" },
        { dueDate: "2027-01-05", arsCents: 2_000_00, kind: "income" },
      ],
      3,
      "2026-11-30",
    )

    expect(result).toEqual([
      { month: "2026-11", arsCents: 10_000_00 },
      { month: "2026-12", arsCents: 9_000_00 },
      { month: "2027-01", arsCents: 11_000_00 },
    ])
  })

  it("un vencimiento del mes actual anterior a hoy pesa en el mes actual, no se pierde", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2026-08-01", arsCents: 3_000_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result[0].arsCents).toBe(7_000_00)
  })

  it("un vencimiento un mes después del último del horizonte no se cuenta", () => {
    // El otro lado del borde de "un vencimiento exactamente en el último mes".
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2026-10-01", arsCents: 1_000_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-08", arsCents: 10_000_00 },
      { month: "2026-09", arsCents: 10_000_00 },
    ])
  })

  it("el saldo se acumula mes a mes, no se recalcula desde el inicial en cada uno", () => {
    const result = projectBalance(
      10_000_00,
      [
        { dueDate: "2026-09-10", arsCents: 1_000_00, kind: "expense" },
        { dueDate: "2026-10-10", arsCents: 1_000_00, kind: "expense" },
        { dueDate: "2026-11-10", arsCents: 1_000_00, kind: "expense" },
      ],
      4,
      "2026-08-09",
    )

    expect(result.map((p) => p.arsCents)).toEqual([10_000_00, 9_000_00, 8_000_00, 7_000_00])
  })

  it("un vencimiento exactamente en el último mes del horizonte queda incluido", () => {
    const result = projectBalance(
      10_000_00,
      [{ dueDate: "2026-09-20", arsCents: 1_000_00, kind: "expense" }],
      2,
      "2026-08-09",
    )

    // Horizonte de 2 meses desde agosto: el último mes es septiembre. Un
    // vencimiento del 20/09 cae justo en ese mes (no > lastMonth) y pesa ahí.
    expect(result).toEqual([
      { month: "2026-08", arsCents: 10_000_00 },
      { month: "2026-09", arsCents: 9_000_00 },
    ])
  })
})

describe("spendByCategory", () => {
  it("suma los egresos por categoría y los ordena de mayor a menor", () => {
    const result = spendByCategory(
      [
        { categoryId: "a", arsCents: 1_000 },
        { categoryId: "b", arsCents: 5_000 },
        { categoryId: "a", arsCents: 2_000 },
      ],
      [
        { id: "a", name: "Comida" },
        { id: "b", name: "Alquiler" },
      ],
    )

    expect(result).toEqual([
      { name: "Alquiler", arsCents: 5_000 },
      { name: "Comida", arsCents: 3_000 },
    ])
  })

  it("agrupa como Sin categoría lo que no tiene", () => {
    const result = spendByCategory([{ categoryId: null, arsCents: 700 }], [])
    expect(result).toEqual([{ name: "Sin categoría", arsCents: 700 }])
  })

  it("con la lista vacía, devuelve una lista vacía", () => {
    expect(spendByCategory([], [])).toEqual([])
  })

  it("un gasto de una categoría que no está en la lista cae en Sin categoría", () => {
    // Pasa cuando la lista viene sólo con las categorías activas y el gasto es
    // de una archivada: sin esto el gráfico mostraría "undefined" como nombre.
    const result = spendByCategory(
      [
        { categoryId: "archivada-1", arsCents: 2_000 },
        { categoryId: "activa-1", arsCents: 1_000 },
      ],
      [{ id: "activa-1", name: "Comida" }],
    )

    expect(result).toEqual([
      { name: "Sin categoría", arsCents: 2_000 },
      { name: "Comida", arsCents: 1_000 },
    ])
  })

  it("los gastos sin categoría se suman junto con los de categoría desconocida", () => {
    const result = spendByCategory(
      [
        { categoryId: null, arsCents: 700 },
        { categoryId: "fantasma", arsCents: 300 },
      ],
      [],
    )

    expect(result).toEqual([{ name: "Sin categoría", arsCents: 1_000 }])
  })

  it("suma junto lo de dos categorías con ids distintos que comparten nombre", () => {
    // Puede pasar de verdad: el índice único de `category` es por
    // (userId, name, kind) y sólo entre las activas (Task 16), así que una
    // categoría archivada y una activa nueva pueden compartir nombre con ids
    // distintos. El gráfico agrupa por nombre, así que tienen que sumarse juntas.
    const result = spendByCategory(
      [
        { categoryId: "activa-1", arsCents: 1_000 },
        { categoryId: "archivada-1", arsCents: 2_000 },
      ],
      [
        { id: "activa-1", name: "Comida" },
        { id: "archivada-1", name: "Comida" },
      ],
    )

    expect(result).toEqual([{ name: "Comida", arsCents: 3_000 }])
  })
})

describe("monthlyTotals", () => {
  it("devuelve un punto por mes en orden cronológico", () => {
    const result = monthlyTotals(
      [
        { date: "2026-07-15", kind: "income", arsCents: 100_00 },
        { date: "2026-08-01", kind: "expense", arsCents: 40_00 },
        { date: "2026-08-20", kind: "expense", arsCents: 10_00 },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-06", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-07", incomeArsCents: 100_00, expenseArsCents: 0 },
      { month: "2026-08", incomeArsCents: 0, expenseArsCents: 50_00 },
    ])
  })

  it("ignora un movimiento fuera de la ventana de meses, tanto anterior como posterior", () => {
    const result = monthlyTotals(
      [
        { date: "2026-05-15", kind: "income", arsCents: 999_00 },
        { date: "2026-09-01", kind: "expense", arsCents: 888_00 },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-06", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-07", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-08", incomeArsCents: 0, expenseArsCents: 0 },
    ])
  })

  it("cuenta los movimientos del primer y del último mes de la ventana", () => {
    // El otro lado del borde del test anterior: el 01/06 y el 31/08 están
    // adentro. Con la ventana corrida un mes, cualquiera de los dos se caería.
    const result = monthlyTotals(
      [
        { date: "2026-06-01", kind: "income", arsCents: 100_00 },
        { date: "2026-08-31", kind: "expense", arsCents: 200_00 },
      ],
      3,
      "2026-08-09",
    )

    expect(result).toEqual([
      { month: "2026-06", incomeArsCents: 100_00, expenseArsCents: 0 },
      { month: "2026-07", incomeArsCents: 0, expenseArsCents: 0 },
      { month: "2026-08", incomeArsCents: 0, expenseArsCents: 200_00 },
    ])
  })

  it("la ventana termina en el mes de hoy y arranca months-1 meses atrás", () => {
    expect(monthlyTotals([], 6, "2026-01-31").map((m) => m.month)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ])
  })

  it("con hoy en un 31, la ventana hacia atrás no repite ni saltea ningún mes", () => {
    // Igual que en la proyección, pero con `addMonthsClamped` en negativo:
    // el 31 de marzo menos un mes recorta al 28 de febrero, y el mes tiene que
    // ser febrero, no marzo otra vez.
    for (const hoy of ["2026-01-31", "2026-03-31", "2026-05-31", "2028-02-29"]) {
      const meses = monthlyTotals([], 12, hoy).map((m) => m.month)

      expect(meses).toHaveLength(12)
      expect(new Set(meses).size).toBe(12)
      expect([...meses].sort()).toEqual(meses)
      expect(meses.at(-1)).toBe(hoy.slice(0, 7))
    }
  })

  it("un mes sin movimientos aparece igual, en cero", () => {
    // El gráfico necesita el punto: si el mes vacío se salteara, la línea
    // uniría julio con septiembre como si agosto no hubiera existido.
    const result = monthlyTotals([], 3, "2026-08-09")

    expect(result).toHaveLength(3)
    expect(result.every((m) => m.incomeArsCents === 0 && m.expenseArsCents === 0)).toBe(true)
  })
})
