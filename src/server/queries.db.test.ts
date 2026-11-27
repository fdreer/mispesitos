import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, inArray } from "drizzle-orm"

import { db, sqlClient, withUser } from "@/db/client"
import {
  cardStatement,
  category,
  creditCard,
  installment,
  movement,
  user,
  userSettings,
} from "@/db/schema"
import { computeBalances } from "@/lib/balance"
import {
  assertCurrency,
  assertExchangeDirection,
  assertInstallmentMovementKind,
} from "@/lib/movement-asserts"
import {
  listStatementInstallments,
  listStatementSummaries,
  listUnpaidCardInstallments,
} from "@/server/card-queries"
import {
  countMovementsByCategory,
  getBalances,
  getSettings,
  listCategories,
  listExchanges,
  listMovements,
  listPaidInstallments,
  listPaidInstallmentsForReport,
  listPendingInstallments,
  queryMovementsView,
} from "@/server/queries"
import { CARD_FILTER_CASH, parseMovementQuery } from "@/lib/movement-query"

const USUARIO_A = "queries-test-a"
const USUARIO_B = "queries-test-b"
const USUARIO_SIN_ONBOARDING = "queries-test-sin-onboarding"
const USUARIOS = [USUARIO_A, USUARIO_B, USUARIO_SIN_ONBOARDING]

const SALDO_INICIAL_A = "2026-03-15"

const CAT = {
  alquiler: "q-cat-a-alquiler",
  bonos: "q-cat-a-bonos",
  comida: "q-cat-a-comida",
  ocio: "q-cat-a-ocio",
  sueldo: "q-cat-a-sueldo",
}

const MOV = {
  comida: "q-mov-a-comida",
  sueldo: "q-mov-a-sueldo",
  alquiler: "q-mov-a-alquiler",
  viejo: "q-mov-a-viejo",
  junioTemprano: "q-mov-a-junio-temprano",
  junioTarde: "q-mov-a-junio-tarde",
  cambioVenta: "q-mov-a-cambio-venta",
  cambioViejo: "q-mov-a-cambio-viejo",
  cambioBorde: "q-mov-a-cambio-borde",
}

const INS = {
  comida1: "q-ins-a-comida-mayo",
  comida2: "q-ins-a-comida-abril",
  comida3: "q-ins-a-comida-junio",
  sueldo1: "q-ins-a-sueldo-1",
  alquiler1: "q-ins-a-alquiler-1",
  alquiler2: "q-ins-a-alquiler-2",
  viejo1: "q-ins-a-viejo-1",
}

const nombres = (filas: { name: string }[]) => filas.map((f) => f.name)
const ids = (filas: { id: string }[]) => filas.map((f) => f.id)

async function sembrarUsuario(id: string) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@test.local`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function sembrarDatosA() {
  await withUser(USUARIO_A, async (tx) => {
    await tx.insert(userSettings).values({
      userId: USUARIO_A,
      initialBalanceArsCents: 500_000_00,
      initialBalanceUsdCents: 100_00,
      initialBalanceDate: SALDO_INICIAL_A,
      preferredRate: "blue",
    })

    // A propósito en orden inverso al alfabético: si alguien saca el
    // `orderBy(asc(name))`, el scan devuelve el orden de inserción y los
    // tests de orden se ponen rojos en vez de pasar de casualidad.
    await tx.insert(category).values([
      { id: CAT.sueldo, userId: USUARIO_A, name: "Sueldo", kind: "income" },
      { id: CAT.ocio, userId: USUARIO_A, name: "Ocio", kind: "expense", archived: true },
      { id: CAT.comida, userId: USUARIO_A, name: "Comida", kind: "expense" },
      { id: CAT.bonos, userId: USUARIO_A, name: "Bonos", kind: "income", archived: true },
      { id: CAT.alquiler, userId: USUARIO_A, name: "Alquiler", kind: "expense" },
    ])

    /**
     * `createdAt` va explícito en las nueve: el default de la columna es
     * `now()`, que en Postgres es la hora de INICIO DE LA TRANSACCIÓN. Como
     * todo esto entra en una sola transacción, las nueve filas quedarían con
     * el mismo `created_at` y el desempate de `listMovements` (fecha desc,
     * alta desc) no se podría probar: el orden entre dos movimientos del
     * mismo día lo elegiría la base.
     *
     * El orden de inserción tampoco es el que espera el test: es otro seguro
     * contra un `orderBy` que se caiga sin que nada se ponga rojo.
     */
    await tx.insert(movement).values([
      {
        id: MOV.comida,
        userId: USUARIO_A,
        kind: "expense",
        description: "Supermercado",
        categoryId: CAT.comida,
        date: "2026-03-10",
        currency: "ARS",
        amountCents: 180_00,
        createdAt: new Date("2026-03-10T10:00:00Z"),
      },
      {
        id: MOV.sueldo,
        userId: USUARIO_A,
        kind: "income",
        description: "Honorarios en dólares",
        categoryId: CAT.sueldo,
        date: SALDO_INICIAL_A,
        currency: "USD",
        amountCents: 200_00,
        createdAt: new Date("2026-03-15T10:00:00Z"),
      },
      {
        id: MOV.alquiler,
        userId: USUARIO_A,
        kind: "expense",
        description: "Alquiler en dólares",
        categoryId: CAT.alquiler,
        date: "2026-04-01",
        currency: "USD",
        amountCents: 300_00,
        createdAt: new Date("2026-04-01T10:00:00Z"),
      },
      {
        id: MOV.viejo,
        userId: USUARIO_A,
        kind: "income",
        description: "Cobro anterior al saldo inicial",
        categoryId: CAT.sueldo,
        date: "2026-02-01",
        currency: "USD",
        amountCents: 80_00,
        createdAt: new Date("2026-02-01T10:00:00Z"),
      },
      {
        id: MOV.junioTemprano,
        userId: USUARIO_A,
        kind: "expense",
        description: "Kiosco de la mañana",
        categoryId: CAT.comida,
        date: "2026-06-01",
        currency: "ARS",
        amountCents: 11_00,
        createdAt: new Date("2026-06-01T09:00:00Z"),
      },
      {
        id: MOV.junioTarde,
        userId: USUARIO_A,
        kind: "expense",
        description: "Kiosco de la tarde",
        categoryId: CAT.comida,
        date: "2026-06-01",
        currency: "ARS",
        amountCents: 22_00,
        createdAt: new Date("2026-06-01T18:00:00Z"),
      },
      {
        id: MOV.cambioVenta,
        userId: USUARIO_A,
        kind: "exchange",
        description: "Venta de dólares",
        categoryId: null,
        date: "2026-05-20",
        currency: "USD",
        amountCents: 30_00,
        rate: "1500",
        direction: "sell",
        createdAt: new Date("2026-05-20T10:00:00Z"),
      },
      {
        id: MOV.cambioViejo,
        userId: USUARIO_A,
        kind: "exchange",
        description: "Compra anterior al saldo inicial",
        categoryId: null,
        date: "2026-02-20",
        currency: "USD",
        amountCents: 10_00,
        rate: "800",
        direction: "buy",
        createdAt: new Date("2026-02-20T10:00:00Z"),
      },
      {
        id: MOV.cambioBorde,
        userId: USUARIO_A,
        kind: "exchange",
        description: "Compra el día del saldo inicial",
        categoryId: null,
        date: SALDO_INICIAL_A,
        currency: "USD",
        amountCents: 50_00,
        rate: "1100",
        direction: "buy",
        createdAt: new Date("2026-03-15T08:00:00Z"),
      },
    ])

    // Las cuotas de `comida` entran 3, 1, 2 y las pendientes quedan en el
    // orden inverso al de vencimiento: el orden que devuelven las consultas
    // no puede venir de la casualidad del scan.
    await tx.insert(installment).values([
      {
        id: INS.comida3,
        userId: USUARIO_A,
        movementId: MOV.comida,
        number: 3,
        amountCents: 75_00,
        dueDate: "2026-06-10",
      },
      {
        id: INS.comida1,
        userId: USUARIO_A,
        movementId: MOV.comida,
        number: 1,
        amountCents: 45_00,
        dueDate: "2026-05-10",
        paid: true,
        paidDate: "2026-03-20",
      },
      {
        id: INS.comida2,
        userId: USUARIO_A,
        movementId: MOV.comida,
        number: 2,
        amountCents: 60_00,
        dueDate: "2026-04-10",
      },
      // Pagada EXACTAMENTE el día del saldo inicial: es el borde del `gte`
      // que filtra las cuotas en listUsdPositionEvents.
      {
        id: INS.sueldo1,
        userId: USUARIO_A,
        movementId: MOV.sueldo,
        number: 1,
        amountCents: 200_00,
        dueDate: SALDO_INICIAL_A,
        paid: true,
        paidDate: SALDO_INICIAL_A,
      },
      {
        id: INS.alquiler1,
        userId: USUARIO_A,
        movementId: MOV.alquiler,
        number: 1,
        amountCents: 120_00,
        dueDate: "2026-04-01",
        paid: true,
        paidDate: "2026-04-05",
      },
      {
        id: INS.alquiler2,
        userId: USUARIO_A,
        movementId: MOV.alquiler,
        number: 2,
        amountCents: 180_00,
        dueDate: "2026-05-01",
      },
      // Pagada ANTES del saldo inicial: no cuenta para la posición, pero sí
      // aparece en listPaidInstallments, que no filtra por fecha.
      {
        id: INS.viejo1,
        userId: USUARIO_A,
        movementId: MOV.viejo,
        number: 1,
        amountCents: 80_00,
        dueDate: "2026-02-01",
        paid: true,
        paidDate: "2026-03-01",
      },
    ])
  })
}

async function sembrarDatosB() {
  await withUser(USUARIO_B, async (tx) => {
    await tx.insert(userSettings).values({
      userId: USUARIO_B,
      initialBalanceArsCents: 111_111_00,
      initialBalanceUsdCents: 500_00,
      initialBalanceDate: "2026-01-01",
      preferredRate: "oficial",
    })

    await tx.insert(category).values([
      { id: "q-cat-b-comida", userId: USUARIO_B, name: "Comida", kind: "expense" },
      { id: "q-cat-b-sueldo", userId: USUARIO_B, name: "Sueldo", kind: "income" },
      { id: "q-cat-b-zeta", userId: USUARIO_B, name: "Zeta", kind: "expense", archived: true },
    ])

    await tx.insert(movement).values([
      {
        id: "q-mov-b-comida",
        userId: USUARIO_B,
        kind: "expense",
        description: "Supermercado de B",
        categoryId: "q-cat-b-comida",
        date: "2026-03-10",
        currency: "ARS",
        amountCents: 999_00,
        createdAt: new Date("2026-03-10T10:00:00Z"),
      },
      {
        id: "q-mov-b-sueldo",
        userId: USUARIO_B,
        kind: "income",
        description: "Sueldo de B",
        categoryId: "q-cat-b-sueldo",
        date: "2026-04-01",
        currency: "USD",
        amountCents: 777_00,
        createdAt: new Date("2026-04-01T10:00:00Z"),
      },
      // Mismo día que el borde del saldo inicial de A, a propósito.
      {
        id: "q-mov-b-cambio",
        userId: USUARIO_B,
        kind: "exchange",
        description: "Compra de dólares de B",
        categoryId: null,
        date: SALDO_INICIAL_A,
        currency: "USD",
        amountCents: 444_00,
        rate: "1250",
        direction: "buy",
        createdAt: new Date("2026-03-15T10:00:00Z"),
      },
    ])

    await tx.insert(installment).values([
      {
        id: "q-ins-b-comida-1",
        userId: USUARIO_B,
        movementId: "q-mov-b-comida",
        number: 1,
        amountCents: 666_00,
        dueDate: "2026-04-10",
        paid: true,
        paidDate: "2026-03-20",
      },
      {
        id: "q-ins-b-comida-2",
        userId: USUARIO_B,
        movementId: "q-mov-b-comida",
        number: 2,
        amountCents: 333_00,
        dueDate: "2026-05-05",
      },
      {
        id: "q-ins-b-sueldo-1",
        userId: USUARIO_B,
        movementId: "q-mov-b-sueldo",
        number: 1,
        amountCents: 777_00,
        dueDate: "2026-04-01",
        paid: true,
        paidDate: "2026-04-02",
      },
    ])
  })
}

/**
 * Borra todo lo sembrado por este archivo. Corre ANTES de sembrar y DESPUÉS
 * de los tests: si una corrida anterior murió por la mitad, la siguiente
 * arranca limpia igual en vez de reventar contra la PK.
 *
 * El orden importa: `movement -> category` es ON DELETE RESTRICT, así que la
 * categoría no se puede ir antes que el movimiento que la usa. Y las filas de
 * las cuatro tablas de la app sólo son visibles desde adentro de withUser().
 */
async function limpiar() {
  for (const id of USUARIOS) {
    await withUser(id, async (tx) => {
      await tx.delete(installment)
      await tx.delete(movement)
      await tx.delete(category)
      await tx.delete(userSettings)
    })
  }

  await db.delete(user).where(inArray(user.id, USUARIOS))
}

beforeAll(async () => {
  await limpiar()
  for (const id of USUARIOS) await sembrarUsuario(id)
  await sembrarDatosA()
  await sembrarDatosB()
})

afterAll(async () => {
  // La limpieza no puede impedir que se cierre el cliente —si el socket queda
  // abierto, Vitest se queja de handles colgados y la salida deja de estar
  // limpia— pero tampoco puede fallar en silencio: la base es real y
  // COMPARTIDA, y las filas que queden colgadas acá ensucian la próxima
  // corrida. Por eso el error se guarda, se cierra el cliente igual, y recién
  // después se relanza. Antes sólo se imprimía, y un `console.error` en una
  // suite verde no lo lee nadie.
  let fallaDeLimpieza: unknown

  try {
    await limpiar()
  } catch (error) {
    fallaDeLimpieza = error
  } finally {
    await sqlClient.end()
  }

  if (fallaDeLimpieza !== undefined) {
    // `cause` en vez de tragarse el original: el motivo real es lo único que
    // dice qué filas quedaron y por qué. Si además falló un test, Vitest
    // reporta las dos cosas: esto no tapa nada.
    throw new Error(
      "afterAll: falló la limpieza y pueden haber quedado filas de prueba colgadas en la base real.",
      { cause: fallaDeLimpieza },
    )
  }
})

describe("getSettings", () => {
  it("devuelve la configuración del usuario", async () => {
    const settings = await getSettings(USUARIO_A)

    expect(settings).toMatchObject({
      userId: USUARIO_A,
      initialBalanceArsCents: 500_000_00,
      initialBalanceUsdCents: 100_00,
      initialBalanceDate: SALDO_INICIAL_A,
      preferredRate: "blue",
    })
  })

  it("devuelve null cuando el usuario no completó el onboarding", async () => {
    expect(await getSettings(USUARIO_SIN_ONBOARDING)).toBeNull()
  })

  it("no devuelve la configuración de otro usuario", async () => {
    const settings = await getSettings(USUARIO_B)

    // Los valores de B son distintos de los de A en las cinco columnas: si la
    // consulta trajera la fila equivocada, esto lo agarra por valor.
    expect(settings).toMatchObject({
      userId: USUARIO_B,
      initialBalanceArsCents: 111_111_00,
      initialBalanceUsdCents: 500_00,
      initialBalanceDate: "2026-01-01",
      preferredRate: "oficial",
    })
  })
})

describe("listCategories", () => {
  it("por default trae sólo las activas, ordenadas por nombre", async () => {
    expect(nombres(await listCategories(USUARIO_A))).toEqual(["Alquiler", "Comida", "Sueldo"])
  })

  it("con includeArchived trae también las archivadas, en el mismo orden", async () => {
    expect(nombres(await listCategories(USUARIO_A, undefined, true))).toEqual([
      "Alquiler",
      "Bonos",
      "Comida",
      "Ocio",
      "Sueldo",
    ])
  })

  it("filtra por tipo sin dejar de excluir las archivadas", async () => {
    // Las de egreso son Alquiler, Comida y Ocio; Ocio está archivada.
    expect(nombres(await listCategories(USUARIO_A, "expense"))).toEqual(["Alquiler", "Comida"])
    // Las de ingreso son Sueldo y Bonos; Bonos está archivada.
    expect(nombres(await listCategories(USUARIO_A, "income"))).toEqual(["Sueldo"])
  })

  it("el filtro por tipo y el de archivadas se combinan, no se reemplazan", async () => {
    // Éste es el caso que usa el dashboard para resolver el nombre de la
    // categoría de un egreso viejo ya archivado: si `kind` pisara a
    // `includeArchived` se colaría Bonos, y al revés se caería Ocio.
    expect(nombres(await listCategories(USUARIO_A, "expense", true))).toEqual([
      "Alquiler",
      "Comida",
      "Ocio",
    ])
    expect(nombres(await listCategories(USUARIO_A, "income", true))).toEqual(["Bonos", "Sueldo"])
  })

  it("no trae categorías de otro usuario", async () => {
    const cats = await listCategories(USUARIO_A, undefined, true)

    // B también tiene "Comida" y "Sueldo": el largo por sí solo no alcanzaría.
    expect(cats.every((c) => c.userId === USUARIO_A)).toBe(true)
    expect([...ids(cats)].sort()).toEqual(
      [CAT.alquiler, CAT.bonos, CAT.comida, CAT.ocio, CAT.sueldo].sort(),
    )
  })

  it("devuelve una lista vacía para un usuario sin categorías", async () => {
    expect(await listCategories(USUARIO_SIN_ONBOARDING, undefined, true)).toEqual([])
  })
})

describe("listMovements", () => {
  it("trae todos los movimientos del usuario, del más nuevo al más viejo", async () => {
    expect(ids(await listMovements(USUARIO_A))).toEqual([
      MOV.junioTarde, // 2026-06-01 18:00
      MOV.junioTemprano, // 2026-06-01 09:00
      MOV.cambioVenta, // 2026-05-20
      MOV.alquiler, // 2026-04-01
      MOV.sueldo, // 2026-03-15 10:00
      MOV.cambioBorde, // 2026-03-15 08:00
      MOV.comida, // 2026-03-10
      MOV.cambioViejo, // 2026-02-20
      MOV.viejo, // 2026-02-01
    ])
  })

  it("desempata dos movimientos del mismo día por fecha de alta descendente", async () => {
    // Los dos son del 2026-06-01 y se insertaron en el orden inverso al
    // esperado: el único criterio que puede ordenarlos es `created_at`.
    const movs = await listMovements(USUARIO_A, { from: "2026-06-01", to: "2026-06-01" })

    expect(ids(movs)).toEqual([MOV.junioTarde, MOV.junioTemprano])
  })

  it("agrupa las cuotas con su movimiento y las ordena por número", async () => {
    const movs = await listMovements(USUARIO_A, { categoryId: CAT.comida })
    const comida = movs.find((m) => m.id === MOV.comida)

    expect(comida?.installments.map((i) => i.number)).toEqual([1, 2, 3])
    // Los importes atan cada cuota a su número: unas cuotas cruzadas entre sí
    // seguirían dando [1, 2, 3].
    expect(comida?.installments.map((i) => i.amountCents)).toEqual([45_00, 60_00, 75_00])
  })

  it("un movimiento sin cuotas viene con la lista vacía, no sin la propiedad", async () => {
    const movs = await listMovements(USUARIO_A, { kind: "exchange" })

    expect(movs).toHaveLength(3)
    expect(movs.map((m) => m.installments)).toEqual([[], [], []])
  })

  it("no mezcla las cuotas de un movimiento con las de otro", async () => {
    const movs = await listMovements(USUARIO_A)
    const porId = new Map(movs.map((m) => [m.id, ids(m.installments)]))

    expect(porId.get(MOV.comida)).toEqual([INS.comida1, INS.comida2, INS.comida3])
    expect(porId.get(MOV.alquiler)).toEqual([INS.alquiler1, INS.alquiler2])
    expect(porId.get(MOV.sueldo)).toEqual([INS.sueldo1])
    expect(porId.get(MOV.viejo)).toEqual([INS.viejo1])
  })

  it("filtra por tipo", async () => {
    expect([...ids(await listMovements(USUARIO_A, { kind: "expense" }))].sort()).toEqual(
      [MOV.junioTarde, MOV.junioTemprano, MOV.alquiler, MOV.comida].sort(),
    )
    expect([...ids(await listMovements(USUARIO_A, { kind: "income" }))].sort()).toEqual(
      [MOV.sueldo, MOV.viejo].sort(),
    )
    expect([...ids(await listMovements(USUARIO_A, { kind: "exchange" }))].sort()).toEqual(
      [MOV.cambioVenta, MOV.cambioViejo, MOV.cambioBorde].sort(),
    )
  })

  it("filtra por categoría", async () => {
    expect([...ids(await listMovements(USUARIO_A, { categoryId: CAT.comida }))].sort()).toEqual(
      [MOV.comida, MOV.junioTarde, MOV.junioTemprano].sort(),
    )
    expect(ids(await listMovements(USUARIO_A, { categoryId: CAT.alquiler }))).toEqual([
      MOV.alquiler,
    ])
  })

  /*
   * Fase 2 del plan v2: los movimientos van siempre a una hoja, así que
   * filtrar por un padre sólo por su id daría una lista vacía. Se arma el
   * árbol adentro del test (Hogar › Alquiler) y se desarma en el `finally`:
   * el resto de la suite cuenta las categorías sembradas.
   */
  it("filtrar por una categoría padre trae lo de sus subcategorías", async () => {
    const HOGAR = "q-cat-a-hogar"
    try {
      await withUser(USUARIO_A, async (tx) => {
        await tx.insert(category).values({ id: HOGAR, userId: USUARIO_A, name: "Hogar", kind: "expense" })
        await tx.update(category).set({ parentId: HOGAR }).where(eq(category.id, CAT.alquiler))
      })

      expect(ids(await listMovements(USUARIO_A, { categoryId: HOGAR }))).toEqual([MOV.alquiler])
      // Y la hija sola sigue filtrando como antes.
      expect(ids(await listMovements(USUARIO_A, { categoryId: CAT.alquiler }))).toEqual([
        MOV.alquiler,
      ])
    } finally {
      await withUser(USUARIO_A, async (tx) => {
        await tx.update(category).set({ parentId: null }).where(eq(category.id, CAT.alquiler))
        await tx.delete(category).where(eq(category.id, HOGAR))
      })
    }
  })

  it("filtra por moneda", async () => {
    expect([...ids(await listMovements(USUARIO_A, { currency: "ARS" }))].sort()).toEqual(
      [MOV.comida, MOV.junioTarde, MOV.junioTemprano].sort(),
    )
    expect([...ids(await listMovements(USUARIO_A, { currency: "USD" }))].sort()).toEqual(
      [
        MOV.sueldo,
        MOV.alquiler,
        MOV.viejo,
        MOV.cambioVenta,
        MOV.cambioViejo,
        MOV.cambioBorde,
      ].sort(),
    )
  })

  it("el filtro desde incluye la propia fecha", async () => {
    const movs = await listMovements(USUARIO_A, { from: SALDO_INICIAL_A })

    // Los dos del 2026-03-15 tienen que estar: `desde` es >=, no >.
    expect(ids(movs)).toContain(MOV.sueldo)
    expect(ids(movs)).toContain(MOV.cambioBorde)
    expect(ids(movs)).not.toContain(MOV.comida) // 2026-03-10, un día antes
    expect(movs).toHaveLength(6)
  })

  it("el filtro hasta incluye la propia fecha", async () => {
    const movs = await listMovements(USUARIO_A, { to: SALDO_INICIAL_A })

    expect(ids(movs)).toContain(MOV.sueldo)
    expect(ids(movs)).toContain(MOV.cambioBorde)
    expect(ids(movs)).not.toContain(MOV.alquiler) // 2026-04-01
    expect(movs).toHaveLength(5)
  })

  it("desde y hasta el mismo día devuelve sólo ese día", async () => {
    const movs = await listMovements(USUARIO_A, { from: SALDO_INICIAL_A, to: SALDO_INICIAL_A })

    expect(ids(movs)).toEqual([MOV.sueldo, MOV.cambioBorde])
  })

  it("combina varios filtros a la vez", async () => {
    const movs = await listMovements(USUARIO_A, {
      kind: "expense",
      currency: "ARS",
      from: "2026-03-01",
      to: "2026-03-31",
    })

    expect(ids(movs)).toEqual([MOV.comida])
  })

  it("filtra por descripción sin distinguir mayúsculas", async () => {
    // Sembrados como "Kiosco de la mañana" / "Kiosco de la tarde": en minúscula
    // sólo matchean si la consulta usa ilike y no like.
    expect([...ids(await listMovements(USUARIO_A, { search: "kiosco" }))].sort()).toEqual(
      [MOV.junioTarde, MOV.junioTemprano].sort(),
    )
  })

  it("el filtro de descripción matchea en el medio del texto", async () => {
    expect([...ids(await listMovements(USUARIO_A, { search: "dólares" }))].sort()).toEqual(
      [MOV.alquiler, MOV.cambioVenta, MOV.sueldo].sort(),
    )
  })

  it("los comodines de LIKE se escapan en vez de traer todo", async () => {
    // Sin escapar, "%" es "cualquier cosa" y devolvería los nueve movimientos.
    expect(await listMovements(USUARIO_A, { search: "%" })).toEqual([])
    expect(await listMovements(USUARIO_A, { search: "_" })).toEqual([])
  })

  it("el filtro de descripción se combina con los demás", async () => {
    const movs = await listMovements(USUARIO_A, { search: "kiosco", kind: "expense" })

    expect(ids(movs)).toEqual([MOV.junioTarde, MOV.junioTemprano])
    expect(await listMovements(USUARIO_A, { search: "kiosco", kind: "income" })).toEqual([])
  })

  it("no trae movimientos de otro usuario", async () => {
    const movs = await listMovements(USUARIO_A)

    // B tiene un movimiento del 2026-03-10 y otro del 2026-03-15, igual que A.
    expect(movs.every((m) => m.userId === USUARIO_A)).toBe(true)
    expect(movs.map((m) => m.amountCents)).not.toContain(999_00)
    expect(movs.map((m) => m.amountCents)).not.toContain(444_00)
  })

  it("devuelve una lista vacía cuando ningún movimiento entra en el filtro", async () => {
    // Cubre el corte temprano antes de consultar las cuotas: sin él, el
    // `inArray` saldría con una lista de ids vacía.
    expect(await listMovements(USUARIO_A, { from: "2030-01-01" })).toEqual([])
    expect(await listMovements(USUARIO_SIN_ONBOARDING)).toEqual([])
  })

  it("filtra por múltiples categorías y expande cada padre a sus hijas", async () => {
    const HOGAR = "q-cat-a-hogar-multi"
    try {
      await withUser(USUARIO_A, async (tx) => {
        await tx
          .insert(category)
          .values({ id: HOGAR, userId: USUARIO_A, name: "Hogar", kind: "expense" })
        await tx.update(category).set({ parentId: HOGAR }).where(eq(category.id, CAT.alquiler))
      })

      const movs = await listMovements(USUARIO_A, {
        kind: "expense",
        categoryIds: [HOGAR, CAT.comida],
      })
      expect([...ids(movs)].sort()).toEqual(
        [MOV.alquiler, MOV.comida, MOV.junioTemprano, MOV.junioTarde].sort(),
      )
    } finally {
      await withUser(USUARIO_A, async (tx) => {
        await tx.update(category).set({ parentId: null }).where(eq(category.id, CAT.alquiler))
        await tx.delete(category).where(eq(category.id, HOGAR))
      })
    }
  })

  it("filtra por medio de pago: tarjeta específica o efectivo/débito", async () => {
    const CARD_A = "q-card-a-visa"
    const MOV_TARJETA = "q-mov-a-tarjeta"
    try {
      await withUser(USUARIO_A, async (tx) => {
        await tx.insert(creditCard).values({
          id: CARD_A,
          userId: USUARIO_A,
          name: "Visa Test",
          closingDay: 20,
          dueDay: 5,
        })
        await tx.insert(movement).values({
          id: MOV_TARJETA,
          userId: USUARIO_A,
          kind: "expense",
          description: "Compra Visa",
          categoryId: CAT.comida,
          date: "2026-06-05",
          currency: "ARS",
          amountCents: 50_00,
          creditCardId: CARD_A,
          createdAt: new Date("2026-06-05T10:00:00Z"),
        })
      })

      expect(ids(await listMovements(USUARIO_A, { kind: "expense", cardId: CARD_A }))).toEqual([
        MOV_TARJETA,
      ])
      const enEfectivo = ids(
        await listMovements(USUARIO_A, { kind: "expense", cardId: CARD_FILTER_CASH }),
      )
      expect(enEfectivo).not.toContain(MOV_TARJETA)
      expect(enEfectivo).toContain(MOV.comida)
    } finally {
      await withUser(USUARIO_A, async (tx) => {
        await tx.delete(movement).where(eq(movement.id, MOV_TARJETA))
        await tx.delete(creditCard).where(eq(creditCard.id, CARD_A))
      })
    }
  })

  it("filtra por importe mínimo y máximo", async () => {
    const movs = await listMovements(USUARIO_A, {
      kind: "expense",
      minCents: 20_00,
      maxCents: 200_00,
    })
    expect([...ids(movs)].sort()).toEqual([MOV.comida, MOV.junioTarde].sort())
  })

  it("el buscador también encuentra por nombre de categoría, padre o importe exacto", async () => {
    const HOGAR = "q-cat-a-hogar-search"
    try {
      await withUser(USUARIO_A, async (tx) => {
        await tx
          .insert(category)
          .values({ id: HOGAR, userId: USUARIO_A, name: "Hogar", kind: "expense" })
        await tx.update(category).set({ parentId: HOGAR }).where(eq(category.id, CAT.alquiler))
      })

      // Por categoría hoja ("Comida" -> Supermercado + Kioscos).
      expect([...ids(await listMovements(USUARIO_A, { kind: "expense", search: "comid" }))].sort()).toEqual(
        [MOV.comida, MOV.junioTemprano, MOV.junioTarde].sort(),
      )
      // Por categoría padre ("Hogar" -> Alquiler).
      expect(ids(await listMovements(USUARIO_A, { kind: "expense", search: "hogar" }))).toEqual([
        MOV.alquiler,
      ])
      // Por importe exacto ("180" = $180,00 = 18000 centavos).
      expect(ids(await listMovements(USUARIO_A, { kind: "expense", search: "180" }))).toEqual([
        MOV.comida,
      ])
    } finally {
      await withUser(USUARIO_A, async (tx) => {
        await tx.update(category).set({ parentId: null }).where(eq(category.id, CAT.alquiler))
        await tx.delete(category).where(eq(category.id, HOGAR))
      })
    }
  })

  it("con dateField='paid' filtra por paid_date de cuotas pagadas en vez de movement.date", async () => {
    // MOV.viejo es del 2026-02-01, pero su cuota se pagó el 2026-03-01.
    expect(
      ids(
        await listMovements(USUARIO_A, {
          kind: "income",
          dateField: "paid",
          from: "2026-03-01",
          to: "2026-03-05",
        }),
      ),
    ).toEqual([MOV.viejo])

    // MOV.comida es del 2026-03-10, pero su cuota 1 se pagó el 2026-03-20.
    expect(
      ids(
        await listMovements(USUARIO_A, {
          kind: "expense",
          dateField: "paid",
          from: "2026-03-18",
          to: "2026-03-25",
        }),
      ),
    ).toEqual([MOV.comida])
  })
})

describe("listPaidInstallmentsForReport", () => {
  it("filtra por paid_date, categorías (incluyendo padre), importes y buscador, sin fugas entre usuarios", async () => {
    const marzo = await listPaidInstallmentsForReport(USUARIO_A, {
      from: "2026-03-01",
      to: "2026-03-31",
    })
    expect(marzo.map((p) => p.amountCents).sort((a, b) => a - b)).toEqual([45_00, 80_00, 200_00])

    const HOGAR = "q-cat-a-hogar-rep"
    try {
      await withUser(USUARIO_A, async (tx) => {
        await tx
          .insert(category)
          .values({ id: HOGAR, userId: USUARIO_A, name: "Hogar", kind: "expense" })
        await tx.update(category).set({ parentId: HOGAR }).where(eq(category.id, CAT.alquiler))
      })

      const deHogar = await listPaidInstallmentsForReport(USUARIO_A, {
        categoryIds: [HOGAR],
      })
      expect(deHogar.map((p) => p.amountCents)).toEqual([120_00])

      const porTexto = await listPaidInstallmentsForReport(USUARIO_A, {
        search: "supermercado",
        minCents: 100_00,
        maxCents: 250_00,
        cardId: CARD_FILTER_CASH,
      })
      expect(porTexto.map((p) => p.amountCents)).toEqual([45_00])
    } finally {
      await withUser(USUARIO_A, async (tx) => {
        await tx.update(category).set({ parentId: null }).where(eq(category.id, CAT.alquiler))
        await tx.delete(category).where(eq(category.id, HOGAR))
      })
    }
  })
})

describe("queryMovementsView", () => {
  it("con includeTotals: false trae la misma página y conteos, sin totales", async () => {
    const query = parseMovementQuery({}, "due")
    const completa = await queryMovementsView(USUARIO_A, "expense", query, "2026-04-20")
    const liviana = await queryMovementsView(USUARIO_A, "expense", query, "2026-04-20", {
      includeTotals: false,
    })

    expect(ids(liviana.items)).toEqual(ids(completa.items))
    expect(liviana.statusCounts).toEqual(completa.statusCounts)
    expect(liviana.totalCount).toBe(completa.totalCount)
    expect(liviana.totals.paid).toEqual({ arsCents: 0, usdCents: 0 })
    expect(completa.totals.paid).not.toEqual({ arsCents: 0, usdCents: 0 })
  })

  it("calcula conteos por estado, totales de cuotas y orden por vencimiento", async () => {
    // El 2026-04-20: comida tiene cuota 2 vencida (2026-04-10) -> overdue;
    // alquiler tiene cuota 2 pendiente (2026-05-01) -> pending; kioscos sin cuotas -> paid.
    const view = await queryMovementsView(
      USUARIO_A,
      "expense",
      parseMovementQuery({}, "due"),
      "2026-04-20",
    )

    expect(view.statusCounts).toEqual({
      all: 4,
      overdue: 1,
      pending: 1,
      paid: 2,
    })
    expect(view.totals.overdue).toEqual({ arsCents: 60_00, usdCents: 0 })
    expect(view.totals.pending).toEqual({ arsCents: 75_00, usdCents: 180_00 })
    expect(view.totals.paid).toEqual({ arsCents: 45_00, usdCents: 120_00 })
    // Por vencimiento: primero el vencido (comida, 2026-04-10), luego pendiente (alquiler, 2026-05-01), luego pagados por fecha desc.
    expect(ids(view.items)).toEqual([
      MOV.comida,
      MOV.alquiler,
      MOV.junioTarde,
      MOV.junioTemprano,
    ])
  })

  it("conserva statusCounts al filtrar por estado, pero acota totales e ítems al estado elegido", async () => {
    const view = await queryMovementsView(
      USUARIO_A,
      "expense",
      parseMovementQuery({ status: "overdue" }, "due"),
      "2026-04-20",
    )

    // Las pastillas mantienen el conteo de los 4 egresos antes de filtrar por estado.
    expect(view.statusCounts).toEqual({
      all: 4,
      overdue: 1,
      pending: 1,
      paid: 2,
    })
    expect(view.totalCount).toBe(1)
    expect(view.page).toBe(1)
    expect(view.totalPages).toBe(1)
    expect(ids(view.items)).toEqual([MOV.comida])
    // Comida tiene cuota 1 pagada ($45), cuota 2 vencida ($60) y cuota 3 pendiente ($75):
    // los totales se calculan cuota por cuota sobre los movimientos filtrados.
    expect(view.totals).toEqual({
      paid: { arsCents: 45_00, usdCents: 0 },
      overdue: { arsCents: 60_00, usdCents: 0 },
      pending: { arsCents: 75_00, usdCents: 0 },
    })
  })

  it("ordena por date y por amount consolidado en ARS", async () => {
    const porFecha = await queryMovementsView(
      USUARIO_A,
      "expense",
      parseMovementQuery({ sort: "date" }, "due"),
      "2026-04-20",
    )
    expect(ids(porFecha.items)).toEqual([
      MOV.junioTarde,
      MOV.junioTemprano,
      MOV.alquiler,
      MOV.comida,
    ])

    // Alquiler son USD 300 * 1300 = ARS 390.000, muy por encima de comida (ARS 180) y kioscos (ARS 10).
    const porImporte = await queryMovementsView(
      USUARIO_A,
      "expense",
      parseMovementQuery({ sort: "amount" }, "due"),
      "2026-04-20",
    )
    expect(ids(porImporte.items)).toEqual([
      MOV.alquiler,
      MOV.comida,
      MOV.junioTarde,
      MOV.junioTemprano,
    ])
  })

  it("hace clamp de page a 1..totalPages y devuelve totales en cero cuando no hay resultados", async () => {
    const fueraDeRango = await queryMovementsView(
      USUARIO_A,
      "expense",
      parseMovementQuery({ page: "99" }, "due"),
      "2026-04-20",
    )
    expect(fueraDeRango.page).toBe(1)
    expect(fueraDeRango.totalPages).toBe(1)
    expect(fueraDeRango.totalCount).toBe(4)

    const vacio = await queryMovementsView(
      USUARIO_A,
      "expense",
      parseMovementQuery({ search: "inexistente-xyz", page: "3" }, "due"),
      "2026-04-20",
    )
    expect(vacio).toEqual({
      items: [],
      page: 1,
      totalPages: 1,
      totalCount: 0,
      statusCounts: { all: 0, overdue: 0, pending: 0, paid: 0 },
      totals: {
        pending: { arsCents: 0, usdCents: 0 },
        overdue: { arsCents: 0, usdCents: 0 },
        paid: { arsCents: 0, usdCents: 0 },
      },
    })
  })
})

describe("listPaidInstallments", () => {
  it("con from deja afuera lo pagado antes de esa fecha", async () => {
    const todas = await listPaidInstallments(USUARIO_A)
    const desde = await listPaidInstallments(USUARIO_A, { from: "2026-04-01" })

    expect(desde.length).toBeGreaterThan(0)
    expect(desde.length).toBeLessThan(todas.length)
    expect(desde.every((p) => p.paidDate >= "2026-04-01")).toBe(true)
    expect(desde).toHaveLength(todas.filter((p) => p.paidDate >= "2026-04-01").length)
  })

  it("trae sólo las cuotas pagadas, con la moneda, el tipo y la categoría del movimiento", async () => {
    const pagadas = await listPaidInstallments(USUARIO_A)

    // Ordenadas por importe acá y no en la consulta: listPaidInstallments no
    // promete ningún orden, así que el test no puede depender de uno.
    expect([...pagadas].sort((a, b) => a.amountCents - b.amountCents)).toEqual([
      {
        paidDate: "2026-03-20",
        amountCents: 45_00,
        categoryId: CAT.comida,
        currency: "ARS",
        kind: "expense",
        statementId: null,
      },
      {
        paidDate: "2026-03-01",
        amountCents: 80_00,
        categoryId: CAT.sueldo,
        currency: "USD",
        kind: "income",
        statementId: null,
      },
      {
        paidDate: "2026-04-05",
        amountCents: 120_00,
        categoryId: CAT.alquiler,
        currency: "USD",
        kind: "expense",
        statementId: null,
      },
      {
        paidDate: SALDO_INICIAL_A,
        amountCents: 200_00,
        categoryId: CAT.sueldo,
        currency: "USD",
        kind: "income",
        statementId: null,
      },
    ])
  })

  it("no se cruza con listPendingInstallments", async () => {
    const [pagadas, pendientes, todas] = await Promise.all([
      listPaidInstallments(USUARIO_A),
      listPendingInstallments(USUARIO_A),
      withUser(USUARIO_A, (tx) => tx.select().from(installment)),
    ])

    // Las 7 cuotas sembradas se reparten entre las dos consultas sin
    // superponerse ni perderse ninguna.
    expect(todas).toHaveLength(7)
    expect(pagadas).toHaveLength(4)
    expect(pendientes).toHaveLength(3)

    // Los importes de las 7 son distintos entre sí: alcanzan como identidad
    // para verificar que ninguna cuota está de los dos lados.
    const importesPagados = new Set(pagadas.map((p) => p.amountCents))
    expect(pendientes.filter((p) => importesPagados.has(p.amountCents))).toEqual([])
  })

  it("no trae cuotas de otro usuario", async () => {
    const pagadas = await listPaidInstallments(USUARIO_A)

    // B tiene dos cuotas pagadas, de 666_00 y 777_00.
    expect(pagadas.map((p) => p.amountCents)).not.toContain(666_00)
    expect(pagadas.map((p) => p.amountCents)).not.toContain(777_00)
  })

  it("devuelve una lista vacía para un usuario sin cuotas", async () => {
    expect(await listPaidInstallments(USUARIO_SIN_ONBOARDING)).toEqual([])
  })
})

describe("listPendingInstallments", () => {
  it("trae sólo las pendientes, ordenadas por vencimiento", async () => {
    const pendientes = await listPendingInstallments(USUARIO_A)

    // Se sembraron en otro orden y las tres son de dos movimientos distintos
    // que se intercalan: ni el orden de inserción ni el de los ids da esto.
    expect(ids(pendientes)).toEqual([INS.comida2, INS.alquiler2, INS.comida3])
    expect(pendientes.map((p) => p.dueDate)).toEqual(["2026-04-10", "2026-05-01", "2026-06-10"])
  })

  it("trae los datos del movimiento que hacen falta para mostrarla y proyectarla", async () => {
    const pendientes = await listPendingInstallments(USUARIO_A)
    const alquiler = pendientes.find((p) => p.movementId === MOV.alquiler)

    expect(alquiler).toEqual({
      id: INS.alquiler2,
      number: 2,
      dueDate: "2026-05-01",
      amountCents: 180_00,
      movementId: MOV.alquiler,
      description: "Alquiler en dólares",
      currency: "USD",
      kind: "expense",
      // Sin tarjeta (Fase 3): no está en ningún resumen.
      statementId: null,
      statementPeriod: null,
      cardId: null,
      cardName: null,
    })
  })

  it("no trae cuotas de otro usuario", async () => {
    const pendientes = await listPendingInstallments(USUARIO_A)

    // B tiene una cuota pendiente de 333_00 que vence el 2026-05-05, o sea
    // en el medio de las tres de A: una fuga se ordenaría prolijamente entre
    // ellas y sólo se ve por el importe.
    expect(pendientes.map((p) => p.amountCents)).not.toContain(333_00)
    expect(pendientes.every((p) => p.movementId.startsWith("q-mov-a-"))).toBe(true)
  })

  it("devuelve una lista vacía para un usuario sin cuotas", async () => {
    expect(await listPendingInstallments(USUARIO_SIN_ONBOARDING)).toEqual([])
  })
})

describe("listExchanges", () => {
  it("trae sólo los cambios de divisa, ordenados por fecha ascendente", async () => {
    const cambios = await listExchanges(USUARIO_A)

    expect(ids(cambios)).toEqual([MOV.cambioViejo, MOV.cambioBorde, MOV.cambioVenta])
    expect(cambios.map((c) => c.date)).toEqual(["2026-02-20", SALDO_INICIAL_A, "2026-05-20"])
  })

  it("no trae ingresos ni egresos", async () => {
    const cambios = await listExchanges(USUARIO_A)

    expect(cambios.every((c) => c.kind === "exchange")).toBe(true)
    expect(cambios.map((c) => c.direction)).toEqual(["buy", "buy", "sell"])
  })

  it("no aplica el corte de la fecha del saldo inicial", async () => {
    // A diferencia de listUsdPositionEvents, acá el cambio anterior al saldo
    // inicial TIENE que venir: el corte por fecha lo hacen los llamadores con
    // la lista completa —computeBalances para el dashboard, y /cambios para
    // separar las operaciones anteriores al saldo inicial, que muestra aparte
    // para que se puedan borrar—. Un filtro de fecha en la consulta se lo
    // sacaría a los dos, y a /cambios le dejaría esas filas invisibles.
    expect(ids(await listExchanges(USUARIO_A))).toContain(MOV.cambioViejo)
  })

  it("no trae cambios de otro usuario", async () => {
    const cambios = await listExchanges(USUARIO_A)

    // B tiene un cambio del 2026-03-15 por 444_00, el mismo día que el de A.
    expect(cambios.every((c) => c.userId === USUARIO_A)).toBe(true)
    expect(cambios.map((c) => c.amountCents)).not.toContain(444_00)
  })

  it("devuelve una lista vacía para un usuario sin cambios", async () => {
    expect(await listExchanges(USUARIO_SIN_ONBOARDING)).toEqual([])
  })
})

describe("countMovementsByCategory", () => {
  it("cuenta los movimientos de cada categoría del usuario, y nada de otro", async () => {
    const conteo = await countMovementsByCategory(USUARIO_A)

    expect(conteo.get(CAT.comida)).toBe(3)
    expect(conteo.get(CAT.alquiler)).toBe(1)
    expect([...conteo.keys()].every((id) => id !== null && id.startsWith("q-cat-a-"))).toBe(true)
  })
})

describe("tarjetas", () => {
  const USUARIO = "queries-test-tarjeta"
  const CAT_T = "q-cat-t-compras"
  const CARD = "q-card-t"
  const RES_ENE = "q-res-t-ene"
  const RES_FEB = "q-res-t-feb"
  const MOV_T = "q-mov-t"

  async function limpiarTarjeta() {
    await withUser(USUARIO, async (tx) => {
      await tx.delete(installment)
      await tx.delete(movement)
      await tx.delete(cardStatement)
      await tx.delete(creditCard)
      await tx.delete(category)
      await tx.delete(userSettings)
    })
    await db.delete(user).where(eq(user.id, USUARIO))
  }

  beforeAll(async () => {
    await limpiarTarjeta()
    await db.insert(user).values({
      id: USUARIO,
      name: USUARIO,
      email: `${USUARIO}@test.local`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await withUser(USUARIO, async (tx) => {
      await tx.insert(userSettings).values({ userId: USUARIO, initialBalanceDate: "2026-01-01" })
      await tx.insert(category).values({ id: CAT_T, userId: USUARIO, name: "Compras", kind: "expense" })
      await tx
        .insert(creditCard)
        .values({ id: CARD, userId: USUARIO, name: "Visa", closingDay: 25, dueDay: 5 })
      await tx.insert(cardStatement).values([
        {
          id: RES_ENE,
          userId: USUARIO,
          cardId: CARD,
          period: "2026-01",
          closingDate: "2026-01-25",
          dueDate: "2026-02-05",
          paidDate: "2026-02-03",
          usdPaidArsCents: 15_000_00,
        },
        {
          id: RES_FEB,
          userId: USUARIO,
          cardId: CARD,
          period: "2026-02",
          closingDate: "2026-02-25",
          dueDate: "2026-03-05",
        },
      ])
      await tx.insert(movement).values({
        id: MOV_T,
        userId: USUARIO,
        kind: "expense",
        description: "Netflix anual",
        categoryId: CAT_T,
        date: "2026-01-10",
        currency: "USD",
        amountCents: 20_00,
        creditCardId: CARD,
      })
      await tx.insert(installment).values([
        {
          id: "q-ins-t-1",
          userId: USUARIO,
          movementId: MOV_T,
          number: 1,
          amountCents: 10_00,
          dueDate: "2026-02-05",
          statementId: RES_ENE,
          paid: true,
          paidDate: "2026-02-03",
        },
        {
          id: "q-ins-t-2",
          userId: USUARIO,
          movementId: MOV_T,
          number: 2,
          amountCents: 10_00,
          dueDate: "2026-03-05",
          statementId: RES_FEB,
        },
      ])
    })
  })

  afterAll(limpiarTarjeta)

  it("una cuota en dólares pagada con pesos se lee como pesos por el monto debitado", async () => {
    expect(await listPaidInstallments(USUARIO)).toEqual([
      {
        paidDate: "2026-02-03",
        amountCents: 15_000_00,
        categoryId: CAT_T,
        currency: "ARS",
        kind: "expense",
        statementId: RES_ENE,
      },
    ])
    expect(await listPaidInstallmentsForReport(USUARIO, { cardId: CARD })).toEqual([
      {
        paidDate: "2026-02-03",
        amountCents: 15_000_00,
        categoryId: CAT_T,
        currency: "ARS",
        kind: "expense",
        statementId: RES_ENE,
      },
    ])
  })

  it("la cuota impaga trae su resumen y su tarjeta", async () => {
    const pendientes = await listPendingInstallments(USUARIO)
    expect(pendientes).toEqual([
      expect.objectContaining({
        id: "q-ins-t-2",
        dueDate: "2026-03-05",
        statementId: RES_FEB,
        statementPeriod: "2026-02",
        cardId: CARD,
        cardName: "Visa",
      }),
    ])
  })
})

describe("tarjetas: filtros de resúmenes y cuotas", () => {
  const USUARIO = "queries-test-tarjeta-filtros"
  const CAT = "q-cat-tf"
  const VISA = "q-card-tf-visa"
  const MASTER = "q-card-tf-master"
  const RES_PAGADO = "q-res-tf-pagado"
  const RES_IMPAGO = "q-res-tf-impago"
  const RES_MASTER = "q-res-tf-master"

  async function limpiar() {
    await withUser(USUARIO, async (tx) => {
      await tx.delete(installment)
      await tx.delete(movement)
      await tx.delete(cardStatement)
      await tx.delete(creditCard)
      await tx.delete(category)
      await tx.delete(userSettings)
    })
    await db.delete(user).where(eq(user.id, USUARIO))
  }

  beforeAll(async () => {
    await limpiar()
    await sembrarUsuario(USUARIO)
    await withUser(USUARIO, async (tx) => {
      await tx.insert(userSettings).values({ userId: USUARIO, initialBalanceDate: "2026-01-01" })
      await tx.insert(category).values({ id: CAT, userId: USUARIO, name: "Compras", kind: "expense" })
      await tx.insert(creditCard).values([
        { id: VISA, userId: USUARIO, name: "Visa", closingDay: 25, dueDay: 5 },
        { id: MASTER, userId: USUARIO, name: "Master", closingDay: 20, dueDay: 1 },
      ])
      await tx.insert(cardStatement).values([
        {
          id: RES_PAGADO,
          userId: USUARIO,
          cardId: VISA,
          period: "2026-01",
          closingDate: "2026-01-25",
          dueDate: "2026-02-05",
          paidDate: "2026-02-03",
        },
        {
          id: RES_IMPAGO,
          userId: USUARIO,
          cardId: VISA,
          period: "2026-02",
          closingDate: "2026-02-25",
          dueDate: "2026-03-05",
        },
        {
          id: RES_MASTER,
          userId: USUARIO,
          cardId: MASTER,
          period: "2026-02",
          closingDate: "2026-02-20",
          dueDate: "2026-03-01",
        },
      ])
      await tx.insert(movement).values([
        {
          id: "q-mov-tf-tele",
          userId: USUARIO,
          kind: "expense",
          description: "Tele",
          categoryId: CAT,
          date: "2026-01-10",
          currency: "ARS",
          amountCents: 300_00,
          creditCardId: VISA,
        },
        {
          id: "q-mov-tf-cafe",
          userId: USUARIO,
          kind: "expense",
          description: "Café",
          categoryId: CAT,
          date: "2026-02-10",
          currency: "ARS",
          amountCents: 5_00,
          creditCardId: MASTER,
        },
      ])
      await tx.insert(installment).values([
        {
          id: "q-ins-tf-tele-1",
          userId: USUARIO,
          movementId: "q-mov-tf-tele",
          number: 1,
          amountCents: 100_00,
          dueDate: "2026-02-05",
          statementId: RES_PAGADO,
          paid: true,
          paidDate: "2026-02-03",
        },
        {
          id: "q-ins-tf-tele-2",
          userId: USUARIO,
          movementId: "q-mov-tf-tele",
          number: 2,
          amountCents: 100_00,
          dueDate: "2026-03-05",
          statementId: RES_IMPAGO,
        },
        {
          id: "q-ins-tf-tele-3",
          userId: USUARIO,
          movementId: "q-mov-tf-tele",
          number: 3,
          amountCents: 100_00,
          dueDate: "2026-03-05",
          statementId: RES_IMPAGO,
        },
        {
          id: "q-ins-tf-cafe-1",
          userId: USUARIO,
          movementId: "q-mov-tf-cafe",
          number: 1,
          amountCents: 5_00,
          dueDate: "2026-03-01",
          statementId: RES_MASTER,
        },
      ])
    })
  })

  afterAll(limpiar)

  it("onlyUnpaid deja afuera los resúmenes pagados y cardId acota a una tarjeta", async () => {
    const impagos = await listStatementSummaries(USUARIO, { onlyUnpaid: true })
    expect(impagos.map((s) => s.id).sort()).toEqual([RES_IMPAGO, RES_MASTER].sort())

    const visa = await listStatementSummaries(USUARIO, { cardId: VISA })
    expect(visa.map((s) => s.id)).toEqual([RES_PAGADO, RES_IMPAGO])
    expect(visa[1].totals).toEqual({ arsCents: 200_00, usdCents: 0, count: 2 })

    const visaImpagos = await listStatementSummaries(USUARIO, { cardId: VISA, onlyUnpaid: true })
    expect(visaImpagos.map((s) => s.id)).toEqual([RES_IMPAGO])
  })

  it("listUnpaidCardInstallments con cardId trae sólo lo impago de esa tarjeta", async () => {
    const visa = await listUnpaidCardInstallments(USUARIO, VISA)
    expect(visa).toHaveLength(2)
    expect(visa.every((i) => i.cardId === VISA)).toBe(true)

    const todas = await listUnpaidCardInstallments(USUARIO)
    expect(todas).toHaveLength(3)
  })

  it("listStatementInstallments cuenta el total de cuotas de cada compra, no las del resumen", async () => {
    const cuotas = await listStatementInstallments(USUARIO, RES_IMPAGO)
    expect(cuotas.map((c) => [c.id, c.number, c.total])).toEqual([
      ["q-ins-tf-tele-2", 2, 3],
      ["q-ins-tf-tele-3", 3, 3],
    ])
  })
})

describe("getBalances", () => {
  const USUARIO = "queries-test-saldo"
  const CAT_E = "q-cat-s-gasto"
  const CAT_I = "q-cat-s-ingreso"
  const CARD = "q-card-s"
  const RES_PESOS = "q-res-s-pesos"
  const RES_DOLARES = "q-res-s-dolares"
  const START = {
    initialArsCents: 1_000_00,
    initialUsdCents: 50_00,
    initialDate: "2026-01-01",
  }

  async function limpiar() {
    await withUser(USUARIO, async (tx) => {
      await tx.delete(installment)
      await tx.delete(movement)
      await tx.delete(cardStatement)
      await tx.delete(creditCard)
      await tx.delete(category)
      await tx.delete(userSettings)
    })
    await db.delete(user).where(eq(user.id, USUARIO))
  }

  type Mov = {
    id: string
    kind: "income" | "expense"
    currency: "ARS" | "USD"
    amountCents: number
    date: string
    creditCardId?: string
  }
  const mov = (m: Mov) => ({
    userId: USUARIO,
    description: m.id,
    categoryId: m.kind === "income" ? CAT_I : CAT_E,
    creditCardId: m.creditCardId ?? null,
    ...m,
  })
  const cuota = (
    movementId: string,
    amountCents: number,
    dueDate: string,
    paidDate: string | null,
    statementId: string | null = null,
  ) => ({
    id: `${movementId}-1`,
    userId: USUARIO,
    movementId,
    number: 1,
    amountCents,
    dueDate,
    paid: paidDate !== null,
    paidDate,
    statementId,
  })
  const cambio = (id: string, direction: "buy" | "sell", usdCents: number, rate: string, date: string) => ({
    id,
    userId: USUARIO,
    kind: "exchange",
    description: id,
    categoryId: null,
    date,
    currency: "USD",
    amountCents: usdCents,
    rate,
    direction,
  })

  beforeAll(async () => {
    await limpiar()
    await sembrarUsuario(USUARIO)
    await withUser(USUARIO, async (tx) => {
      await tx.insert(userSettings).values({ userId: USUARIO, initialBalanceDate: START.initialDate })
      await tx.insert(category).values([
        { id: CAT_E, userId: USUARIO, name: "Gastos", kind: "expense" },
        { id: CAT_I, userId: USUARIO, name: "Ingresos", kind: "income" },
      ])
      await tx
        .insert(creditCard)
        .values({ id: CARD, userId: USUARIO, name: "Visa", closingDay: 25, dueDay: 5 })
      await tx.insert(cardStatement).values([
        // Dólares pagados con pesos: lo percibido es el débito en pesos.
        {
          id: RES_PESOS,
          userId: USUARIO,
          cardId: CARD,
          period: "2026-01",
          closingDate: "2026-01-25",
          dueDate: "2026-02-05",
          paidDate: "2026-02-03",
          usdPaidArsCents: 15_001_37,
        },
        // Dólares pagados con dólares: siguen restando dólares.
        {
          id: RES_DOLARES,
          userId: USUARIO,
          cardId: CARD,
          period: "2026-02",
          closingDate: "2026-02-25",
          dueDate: "2026-03-05",
          paidDate: "2026-02-27",
        },
      ])
      await tx.insert(movement).values([
        mov({ id: "q-s-sueldo", kind: "income", currency: "ARS", amountCents: 100_000_00, date: "2026-01-15" }),
        mov({ id: "q-s-usd-gasto", kind: "expense", currency: "USD", amountCents: 3_00, date: "2026-01-20" }),
        mov({ id: "q-s-usd-cobro", kind: "income", currency: "USD", amountCents: 40_00, date: "2026-01-22" }),
        mov({ id: "q-s-viejo", kind: "income", currency: "ARS", amountCents: 999_00, date: "2025-12-20" }),
        mov({ id: "q-s-futuro", kind: "expense", currency: "ARS", amountCents: 7_00, date: "2026-02-20" }),
        mov({ id: "q-s-pendiente", kind: "expense", currency: "ARS", amountCents: 50_00, date: "2026-01-10" }),
        mov({ id: "q-s-tc-usd-a", kind: "expense", currency: "USD", amountCents: 7_33, date: "2026-01-05", creditCardId: CARD }),
        mov({ id: "q-s-tc-usd-b", kind: "expense", currency: "USD", amountCents: 4_67, date: "2026-01-06", creditCardId: CARD }),
        mov({ id: "q-s-tc-ars", kind: "expense", currency: "ARS", amountCents: 2_000_00, date: "2026-01-07", creditCardId: CARD }),
        mov({ id: "q-s-tc-usd-dol", kind: "expense", currency: "USD", amountCents: 5_00, date: "2026-02-10", creditCardId: CARD }),
        cambio("q-s-fx-compra", "buy", 100_00, "1234.5678", "2026-01-05"),
        cambio("q-s-fx-venta", "sell", 7_77, "1180.5000", "2026-02-10"),
        cambio("q-s-fx-viejo", "sell", 10_00, "900.0000", "2025-12-30"),
        cambio("q-s-fx-futuro", "buy", 1_00, "1500.2500", "2026-03-15"),
      ])
      await tx.insert(installment).values([
        cuota("q-s-sueldo", 100_000_00, "2026-01-15", "2026-01-15"),
        cuota("q-s-usd-gasto", 3_00, "2026-01-20", "2026-01-20"),
        cuota("q-s-usd-cobro", 40_00, "2026-01-22", "2026-01-25"),
        cuota("q-s-viejo", 999_00, "2025-12-20", "2025-12-20"),
        cuota("q-s-futuro", 7_00, "2026-03-10", "2026-03-10"),
        cuota("q-s-pendiente", 50_00, "2026-01-10", null),
        cuota("q-s-tc-usd-a", 7_33, "2026-02-05", "2026-02-03", RES_PESOS),
        cuota("q-s-tc-usd-b", 4_67, "2026-02-05", "2026-02-03", RES_PESOS),
        cuota("q-s-tc-ars", 2_000_00, "2026-02-05", "2026-02-03", RES_PESOS),
        cuota("q-s-tc-usd-dol", 5_00, "2026-03-05", "2026-02-27", RES_DOLARES),
      ])
    })
  })

  afterAll(limpiar)

  /** La cuenta de referencia: lo que hacían las páginas en Node. */
  async function saldoEnNode(asOf: string) {
    const [paid, exchanges] = await Promise.all([
      listPaidInstallments(USUARIO),
      listExchanges(USUARIO),
    ])
    return computeBalances(
      START,
      paid.map((p) => ({
        paidDate: p.paidDate,
        currency: assertCurrency(p.currency),
        kind: assertInstallmentMovementKind(p.kind),
        amountCents: p.amountCents,
      })),
      exchanges.map((e) => ({
        date: e.date,
        direction: assertExchangeDirection(e.direction),
        usdCents: e.amountCents,
        rate: Number(e.rate),
      })),
      asOf,
    )
  }

  it.each(["2026-03-01", "2026-03-31", "2026-01-31", "2025-12-31"])(
    "da lo mismo que computeBalances(perceivedPayments(...)) al %s",
    async (asOf) => {
      expect(await getBalances(USUARIO, START, asOf)).toEqual(await saldoEnNode(asOf))
    },
  )

  it("cuenta el resumen pagado con pesos por su débito, y lo futuro y lo anterior al inicio no", async () => {
    const fxCompra = Math.round(100_00 * 1234.5678)
    const fxVenta = Math.round(7_77 * 1180.5)
    expect(await getBalances(USUARIO, START, "2026-03-01")).toEqual({
      arsCents: 1_000_00 + 100_000_00 - 15_001_37 - 2_000_00 - fxCompra + fxVenta,
      usdCents: 50_00 - 3_00 + 40_00 - 5_00 + 100_00 - 7_77,
    })
  })

  it("no ve datos de otro usuario", async () => {
    expect(await getBalances(USUARIO_SIN_ONBOARDING, START, "2026-03-01")).toEqual({
      arsCents: START.initialArsCents,
      usdCents: START.initialUsdCents,
    })
  })
})
