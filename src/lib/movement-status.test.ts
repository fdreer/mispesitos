import { describe, it, expect } from "vitest"
import { getMovementStatus, summarizeMovementStatus } from "@/lib/movement-status"

const TODAY = "2026-08-10"

describe("getMovementStatus", () => {
  it("pagado cuando todas las cuotas están pagadas", () => {
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2026-07-01" },
          { paid: true, dueDate: "2026-08-01" },
        ],
        TODAY,
      ),
    ).toBe("paid")
  })

  it("vencido cuando hay al menos una cuota impaga con vencimiento anterior a hoy", () => {
    expect(
      getMovementStatus(
        [
          { paid: false, dueDate: "2026-08-09" },
          { paid: false, dueDate: "2026-09-01" },
        ],
        TODAY,
      ),
    ).toBe("overdue")
  })

  it("pendiente cuando las cuotas impagas todavía no vencieron", () => {
    expect(
      getMovementStatus(
        [
          { paid: false, dueDate: "2026-08-15" },
          { paid: false, dueDate: "2026-09-01" },
        ],
        TODAY,
      ),
    ).toBe("pending")
  })

  it("una cuota que vence hoy no está vencida (el borde importa)", () => {
    expect(getMovementStatus([{ paid: false, dueDate: TODAY }], TODAY)).toBe("pending")
  })

  it("una cuota pagada tarde no deja el movimiento vencido", () => {
    // La única vencida está paga: ya no se debe nada de ella. Si el estado
    // mirara todas las cuotas en vez de sólo las impagas, este movimiento
    // aparecería en rojo en la lista de vencidos para siempre.
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2026-07-01" },
          { paid: false, dueDate: "2026-09-01" },
        ],
        TODAY,
      ),
    ).toBe("pending")
  })

  it("todas pagadas es pagado aunque todas hayan vencido", () => {
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2025-01-01" },
          { paid: true, dueDate: "2025-02-01" },
        ],
        TODAY,
      ),
    ).toBe("paid")
  })

  it("una sola cuota impaga que venció ayer alcanza para vencido", () => {
    // El borde del otro lado del "vence hoy": un día antes ya es vencido.
    expect(getMovementStatus([{ paid: false, dueDate: "2026-08-09" }], TODAY)).toBe("overdue")
  })

  it("mezcla de cuotas pagadas e impagas vencidas da vencido", () => {
    expect(
      getMovementStatus(
        [
          { paid: true, dueDate: "2026-07-01" },
          { paid: false, dueDate: "2026-08-01" },
          { paid: true, dueDate: "2026-08-15" },
        ],
        TODAY,
      ),
    ).toBe("overdue")
  })
})

/**
 * El badge de cada fila de la lista necesita el CONTEO, no sólo el estado, y
 * por eso lo recalculaba a mano mientras el filtro de la misma pantalla usaba
 * `getMovementStatus`. Coincidían de casualidad: el día que la regla de
 * "vencido" cambie, filtrar por "Vencido" habría mostrado filas con el badge
 * de "pendiente".
 *
 * NO BORRAR NI RELAJAR: el valor de estos tests no es cada número suelto, es
 * que el estado y los conteos salgan de la MISMA pasada.
 */
describe("summarizeMovementStatus", () => {
  /** Los mismos casos que usa el describe de arriba, con su conteo esperado. */
  const casos = [
    {
      nombre: "todas pagadas",
      cuotas: [
        { paid: true, dueDate: "2026-07-01" },
        { paid: true, dueDate: "2026-08-01" },
      ],
      esperado: { status: "paid", pendingCount: 0, overdueCount: 0 },
    },
    {
      nombre: "dos impagas, una vencida",
      cuotas: [
        { paid: false, dueDate: "2026-08-09" },
        { paid: false, dueDate: "2026-09-01" },
      ],
      esperado: { status: "overdue", pendingCount: 2, overdueCount: 1 },
    },
    {
      nombre: "dos impagas, ninguna vencida",
      cuotas: [
        { paid: false, dueDate: "2026-08-15" },
        { paid: false, dueDate: "2026-09-01" },
      ],
      esperado: { status: "pending", pendingCount: 2, overdueCount: 0 },
    },
    {
      nombre: "la única vencida está paga",
      cuotas: [
        { paid: true, dueDate: "2026-07-01" },
        { paid: false, dueDate: "2026-09-01" },
      ],
      esperado: { status: "pending", pendingCount: 1, overdueCount: 0 },
    },
    {
      nombre: "vence hoy: todavía no está vencida",
      cuotas: [{ paid: false, dueDate: TODAY }],
      esperado: { status: "pending", pendingCount: 1, overdueCount: 0 },
    },
    {
      nombre: "tres impagas y todas vencidas",
      cuotas: [
        { paid: false, dueDate: "2026-06-01" },
        { paid: false, dueDate: "2026-07-01" },
        { paid: false, dueDate: "2026-08-09" },
      ],
      esperado: { status: "overdue", pendingCount: 3, overdueCount: 3 },
    },
    {
      nombre: "sin cuotas",
      cuotas: [],
      esperado: { status: "paid", pendingCount: 0, overdueCount: 0 },
    },
  ] as const

  it.each(casos)("$nombre: estado y conteos", ({ cuotas, esperado }) => {
    expect(summarizeMovementStatus([...cuotas], TODAY)).toEqual(esperado)
  })

  it("el estado que devuelve el resumen es EXACTAMENTE el que devuelve getMovementStatus", () => {
    // Ésta es la garantía que el badge y el filtro necesitan: una sola regla,
    // no dos que hoy coinciden. Si alguien vuelve a escribir el conteo aparte,
    // este test no se entera —vive en el consumidor— pero sí se entera de que
    // las dos funciones exportadas dejen de estar atadas entre sí.
    for (const { cuotas } of casos) {
      expect(summarizeMovementStatus([...cuotas], TODAY).status).toBe(
        getMovementStatus([...cuotas], TODAY),
      )
    }
  })

  it("los conteos y el estado no pueden contradecirse", () => {
    for (const { cuotas } of casos) {
      const { status, pendingCount, overdueCount } = summarizeMovementStatus(
        [...cuotas],
        TODAY,
      )

      expect(overdueCount).toBeLessThanOrEqual(pendingCount)
      expect(status === "paid").toBe(pendingCount === 0)
      expect(status === "overdue").toBe(overdueCount > 0)
      // El badge de "pendiente(s)" se muestra sólo en este caso, y con este
      // número: si fuera 0, la lista mostraría un badge vacío.
      expect(status === "pending").toBe(pendingCount > 0 && overdueCount === 0)
    }
  })

  it("cuenta sólo las impagas, aunque haya pagadas vencidas de sobra", () => {
    // El conteo del badge sale de las impagas, igual que el estado: una cuota
    // vencida y pagada no puede sumar al número rojo.
    expect(
      summarizeMovementStatus(
        [
          { paid: true, dueDate: "2020-01-01" },
          { paid: true, dueDate: "2020-02-01" },
          { paid: false, dueDate: "2026-08-09" },
        ],
        TODAY,
      ),
    ).toEqual({ status: "overdue", pendingCount: 1, overdueCount: 1 })
  })
})
