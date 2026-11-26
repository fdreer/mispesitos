import { describe, expect, it } from "vitest"

import {
  defaultQuickAddKind,
  isMoreMenuActive,
  isRouteActive,
} from "@/lib/mobile-nav"

describe("mobile-nav", () => {
  it("marca activa la ruta exacta y sus subrutas, sin confundir prefijos parciales", () => {
    expect(isRouteActive("/tarjetas", "/tarjetas")).toBe(true)
    expect(isRouteActive("/tarjetas/card-1", "/tarjetas")).toBe(true)
    expect(isRouteActive("/tarjetas-viejas", "/tarjetas")).toBe(false)
    expect(isRouteActive("/dashboard", "/egresos")).toBe(false)
  })

  it("identifica cuándo la pantalla actual pertenece al menú Más", () => {
    expect(isMoreMenuActive("/tarjetas")).toBe(true)
    expect(isMoreMenuActive("/tarjetas/abc")).toBe(true)
    expect(isMoreMenuActive("/informes")).toBe(true)
    expect(isMoreMenuActive("/cambios")).toBe(true)
    expect(isMoreMenuActive("/categorias")).toBe(true)
    expect(isMoreMenuActive("/ajustes")).toBe(true)

    expect(isMoreMenuActive("/dashboard")).toBe(false)
    expect(isMoreMenuActive("/egresos")).toBe(false)
    expect(isMoreMenuActive("/ingresos")).toBe(false)
  })

  it("elige Ingreso sólo en /ingresos y Egreso en el resto de las pantallas", () => {
    expect(defaultQuickAddKind("/ingresos")).toBe("income")
    expect(defaultQuickAddKind("/egresos")).toBe("expense")
    expect(defaultQuickAddKind("/dashboard")).toBe("expense")
    expect(defaultQuickAddKind("/tarjetas/123")).toBe("expense")
  })
})
