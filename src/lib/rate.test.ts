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
    stubFetch(() => ok({ compra: 1400, venta: 1450 }))

    const result = await fetchSuggestedRate("blue")

    expect(result).toEqual({ buyRate: 1450, sellRate: 1400, referenceRate: 1425 })
  })

  it("el TC de referencia es el punto medio, no un lado del spread", async () => {
    stubFetch(() => ok({ compra: 1400, venta: 1450 }))

    const result = await fetchSuggestedRate("blue")

    expect(result?.referenceRate).toBe(1425)
    expect(result!.referenceRate).toBeGreaterThan(result!.sellRate)
    expect(result!.referenceRate).toBeLessThan(result!.buyRate)
  })

  it("redondea referenceRate a 4 decimales para respetar numeric(12,4)", async () => {
    stubFetch(() => ok({ compra: 1000.0001, venta: 1000.0002 }))

    const result = await fetchSuggestedRate("blue")

    expect(result?.referenceRate).toBe(1000.0002)
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

  it("devuelve null si uno solo de los dos lados es inservible", async () => {
    const mitades = [
      { compra: 1400 },
      { venta: 1450 },
      { compra: 1400, venta: 0 },
      { compra: 0, venta: 1450 },
      { compra: 1400, venta: null },
      { compra: 1400, venta: -1 },
    ]

    for (const body of mitades) {
      stubFetch(() => ok(body))
      expect(await fetchSuggestedRate("blue")).toBeNull()
    }
  })

  it("devuelve null si el cuerpo no es JSON", async () => {
    stubFetch(
      () =>
        new Response("<html>bloqueado</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    )

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null si el JSON no es un objeto con los campos", async () => {
    for (const body of [null, 1450, "1450", [], [{ compra: 1400, venta: 1450 }], {}]) {
      stubFetch(() => ok(body))
      expect(await fetchSuggestedRate("blue")).toBeNull()
    }
  })

  it("no convierte los números que vienen como texto", async () => {
    stubFetch(() => ok({ compra: "1400", venta: "1450" }))

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null si los números no son finitos", async () => {
    for (const par of [
      { compra: Number.NaN, venta: 1450 },
      { compra: 1400, venta: Number.POSITIVE_INFINITY },
    ]) {
      stubFetch(
        () => ({ ok: true, json: async () => par }) as unknown as Response,
      )
      expect(await fetchSuggestedRate("blue")).toBeNull()
    }
  })

  it("devuelve null si la espera se corta por timeout", async () => {
    stubFetch(() =>
      Promise.reject(new DOMException("The operation was aborted.", "TimeoutError")),
    )

    expect(await fetchSuggestedRate("blue")).toBeNull()
  })

  it("devuelve null ante cualquier estado de error, no sólo el 500", async () => {
    for (const status of [301, 400, 401, 403, 404, 429, 503]) {
      stubFetch(() => new Response("nope", { status }))
      expect(await fetchSuggestedRate("blue")).toBeNull()
    }
  })

  it("nunca tira, pase lo que pase con la respuesta", async () => {
    const respuestasHostiles: (() => Response | Promise<Response>)[] = [
      () => {
        throw new Error("fetch explotó de entrada")
      },
      () => ({ ok: true, json: () => Promise.reject(new Error("cuerpo cortado")) }) as unknown as Response,
      () => ({}) as Response,
      () => null as unknown as Response,
    ]

    for (const impl of respuestasHostiles) {
      stubFetch(impl)
      await expect(fetchSuggestedRate("blue")).resolves.toBeNull()
    }
  })

  it("corta la espera en vez de colgar el render", async () => {
    const spy = stubFetch(() => ok({ compra: 1400, venta: 1450 }))

    await fetchSuggestedRate("blue")

    expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
