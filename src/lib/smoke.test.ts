import { describe, it, expect } from "vitest"
import { SMOKE_VALUE } from "@/lib/smoke"

describe("toolchain", () => {
  it("corre tests con el alias @ configurado", () => {
    expect(SMOKE_VALUE).toBe("smoke-ok")
  })
})
