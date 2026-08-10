import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchSuggestedRate } from "@/lib/rate"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn((...args: Parameters<typeof fetch>) => impl(String(args[0])))
  vi.stubGlobal("fetch", spy)
  return spy
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("fetchSuggestedRate", () => {
  it("mapea compra y venta desde la perspectiva del usuario", async () => {
    // La API informa desde la perspectiva de la casa de cambio:
    // "venta" es a lo que ELLA vende, o sea lo que VOS pagás por comprar.
    stubFetch(() => ok({ compra: 1400, venta: 1450 }))

    const result = await fetchSuggestedRate("blue")

    expect(result).toEqual({ buyRate: 1450, sellRate: 1400, referenceRate: 1425 })
  })

  it("el TC de referencia es el punto medio, no un lado del spread", async () => {
    // Un movimiento que no es una operación de cambio (un sueldo en dólares,
    // un alquiler en dólares) se valúa siempre al mismo TC en ambos sentidos.
    // Si entrara por sellRate y saliera por buyRate, cobrar y pagar el mismo
    // día con la misma cotización inventaría una diferencia de cambio.
    stubFetch(() => ok({ compra: 1400, venta: 1450 }))

    const result = await fetchSuggestedRate("blue")

    expect(result?.referenceRate).toBe(1425)
    expect(result!.referenceRate).toBeGreaterThan(result!.sellRate)
    expect(result!.referenceRate).toBeLessThan(result!.buyRate)
  })

  it("usa el endpoint correcto por preferencia", async () => {
    const spy = stubFetch(() => ok({ compra: 1, venta: 2 }))

    await fetchSuggestedRate("oficial")
    expect(spy.mock.calls[0][0]).toContain("/dolares/oficial")

    await fetchSuggestedRate("blue")
    expect(spy.mock.calls[1][0]).toContain("/dolares/blue")
  })

  it("mapea mep al endpoint bolsa", async () => {
    const spy = stubFetch(() => ok({ compra: 1, venta: 2 }))

    await fetchSuggestedRate("mep")

    expect(spy.mock.calls[0][0]).toContain("/dolares/bolsa")
  })

  it("devuelve null si la API responde con error", async () => {
    stubFetch(() => new Response("boom", { status: 500 }))

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null si la red falla", async () => {
    stubFetch(() => Promise.reject(new Error("ENOTFOUND")))

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null si la respuesta no tiene números válidos", async () => {
    stubFetch(() => ok({ compra: "no soy un número", venta: null }))

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null si el TC viene en cero o negativo", async () => {
    stubFetch(() => ok({ compra: 0, venta: 0 }))
    expect(await fetchSuggestedRate("blue")).toBeNull()

    stubFetch(() => ok({ compra: -1400, venta: -1450 }))
    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("corta la espera en vez de colgar el render", async () => {
    const spy = stubFetch(() => ok({ compra: 1400, venta: 1450 }))

    await fetchSuggestedRate("blue")

    expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
