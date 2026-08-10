import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchSuggestedRate } from "@/lib/rate"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: (url: string) => Promise<Response> | Response) {
  const spy = vi.fn((input: RequestInfo | URL) => impl(String(input)))
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

    expect(result).toEqual({ buyRate: 1450, sellRate: 1400 })
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
})
