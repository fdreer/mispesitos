import { describe, it, expect } from "vitest"

import { isCheckViolation, isUniqueViolation } from "@/lib/db-errors"

function drizzleQueryError(cause: unknown): Error {
  const error = new Error("Failed query: …")
  Object.assign(error, { cause })
  return error
}

describe("isUniqueViolation", () => {
  it("reconoce una violación 23505 del constraint indicado, envuelta como la envuelve Drizzle", () => {
    const error = drizzleQueryError({
      code: "23505",
      constraint_name: "category_active_unique",
      message: 'duplicate key value violates unique constraint "category_active_unique"',
    })

    expect(isUniqueViolation(error, "category_active_unique")).toBe(true)
  })

  it("no confunde una violación de unicidad de OTRO constraint", () => {
    const error = drizzleQueryError({ code: "23505", constraint_name: "otra_tabla_unique" })

    expect(isUniqueViolation(error, "category_active_unique")).toBe(false)
  })

  it("no confunde un error con el mismo shape pero otro código (ej. FK, 23503)", () => {
    const error = drizzleQueryError({
      code: "23503",
      constraint_name: "movement_user_id_category_id_category_user_id_id_fk",
    })

    expect(isUniqueViolation(error, "category_active_unique")).toBe(false)
  })

  it("no confunde un error sin cause (timeout, corte de red)", () => {
    expect(isUniqueViolation(new Error("timeout"), "category_active_unique")).toBe(false)
  })

  it("no revienta con valores que no son un Error", () => {
    expect(isUniqueViolation(null, "category_active_unique")).toBe(false)
    expect(isUniqueViolation(undefined, "category_active_unique")).toBe(false)
    expect(isUniqueViolation("boom", "category_active_unique")).toBe(false)
  })

  it("también reconoce el código si viene directo en el error, sin envolver", () => {
    const error = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint_name: "category_active_unique",
    })

    expect(isUniqueViolation(error, "category_active_unique")).toBe(true)
  })
})

describe("isCheckViolation", () => {
  it("reconoce la regla de un trigger, envuelta como la envuelve Drizzle", () => {
    const error = drizzleQueryError({ code: "23514", constraint_name: "category_two_levels" })
    expect(isCheckViolation(error, "category_two_levels")).toBe(true)
  })

  it("reconoce el error pelado de postgres.js, sin `cause`", () => {
    const error = Object.assign(new Error("Un movimiento no puede…"), {
      code: "23514",
      constraint_name: "movement_category_is_leaf",
    })
    expect(isCheckViolation(error, "movement_category_is_leaf")).toBe(true)
  })

  it("no confunde una violación de unicidad con una CHECK del mismo nombre", () => {
    const error = drizzleQueryError({ code: "23505", constraint_name: "category_two_levels" })
    expect(isCheckViolation(error, "category_two_levels")).toBe(false)
  })
})
