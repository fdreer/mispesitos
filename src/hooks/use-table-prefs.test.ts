import { describe, expect, it } from "vitest"

import { defaultTablePrefs, parseTablePrefs, tablePrefsKey } from "@/hooks/use-table-prefs"

describe("parseTablePrefs", () => {
  it("sin nada guardado devuelve los defaults del tipo", () => {
    const expense = parseTablePrefs(null, "expense")
    expect(expense).toEqual(defaultTablePrefs("expense"))
    expect(expense.order).toContain("paymentMethod")
    expect(parseTablePrefs(null, "income").order).not.toContain("paymentMethod")
    expect(expense.hidden).toEqual(["installments", "nextDue"])
  })

  it("JSON roto o que no es objeto cae en los defaults", () => {
    expect(parseTablePrefs("{nope", "income")).toEqual(defaultTablePrefs("income"))
    expect(parseTablePrefs("42", "income")).toEqual(defaultTablePrefs("income"))
    expect(parseTablePrefs("null", "income")).toEqual(defaultTablePrefs("income"))
  })

  it("descarta ids desconocidos o duplicados y agrega al final las columnas que faltan", () => {
    const prefs = parseTablePrefs(
      JSON.stringify({
        order: ["amount", "color", "amount", "date", "paymentMethod"],
        hidden: ["status", "inventada", "status"],
        widths: {},
      }),
      "income",
    )
    expect(prefs.order.slice(0, 2)).toEqual(["amount", "date"])
    expect(prefs.order).not.toContain("paymentMethod")
    expect(new Set(prefs.order).size).toBe(prefs.order.length)
    expect(prefs.order).toHaveLength(defaultTablePrefs("income").order.length)
    expect(prefs.hidden).toEqual(["status"])
  })

  it("los anchos se acotan al mínimo y máximo de la columna; lo que no es número se ignora", () => {
    const prefs = parseTablePrefs(
      JSON.stringify({ widths: { date: 5, description: 99999, amount: "ancho", nope: 200 } }),
      "expense",
    )
    expect(prefs.widths.date).toBe(88)
    expect(prefs.widths.description).toBe(640)
    expect(prefs.widths.amount).toBeUndefined()
    expect(Object.keys(prefs.widths)).toEqual(["date", "description"])
  })

  it("usa una clave por tipo", () => {
    expect(tablePrefsKey("expense")).toBe("mispesitos.table.expense.v1")
    expect(tablePrefsKey("income")).toBe("mispesitos.table.income.v1")
  })
})
