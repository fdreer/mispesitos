import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { and, eq, inArray } from "drizzle-orm"

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
import { usdPosition } from "@/lib/position"
import {
  countMovementsByCategory,
  getSettings,
  listCategories,
  listExchanges,
  listMovements,
  listPaidInstallments,
  listPendingInstallments,
  listUsdPositionEvents,
  queryMovementsView,
} from "@/server/queries"
import { CARD_FILTER_CASH, parseMovementQuery } from "@/lib/movement-query"

/**
 * Tests de la capa de lectura contra la base real. Todo lo que se siembra
 * lleva el prefijo `q-` (y los usuarios `queries-test-`) para no pisarse con
 * `src/db/rls.db.test.ts`, que corre contra la misma base.
 *
 * Se siembran DOS usuarios con datos parecidos —mismos nombres de categoría,
 * mismas fechas, importes distintos— porque cada consulta tiene que probar dos
 * cosas: que trae lo que promete y que no trae nada del otro. Todos los
 * importes son únicos entre sí a propósito: alcanzan como identidad, así que
 * una fuga se ve en el valor y no sólo en el largo de la lista.
 */
const USUARIO_A = "queries-test-a"
const USUARIO_B = "queries-test-b"
/** Existe en `user` pero nunca completó el onboarding: no tiene `user_settings`. */
const USUARIO_SIN_ONBOARDING = "queries-test-sin-onboarding"
const USUARIOS = [USUARIO_A, USUARIO_B, USUARIO_SIN_ONBOARDING]

/**
 * La fecha del saldo inicial de A. Es el borde que separa lo que cuenta para
 * la posición en dólares de lo que ya está adentro del saldo inicial, y hay
 * tres filas sembradas exactamente en este día a propósito.
 */
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

/**
 * Los ids de las cuotas del supermercado NO siguen el orden de su número, y
 * sus vencimientos tampoco. Es a propósito, y la primera versión de estos
 * tests se equivocó justamente acá: con ids `-1/-2/-3` y vencimientos
 * crecientes, sacarle el `orderBy(asc(number))` a `listMovements` dejaba la
 * suite en VERDE, porque cualquier índice que la base eligiera para el scan
 * (la PK sobre `id`, o `installment_user_due_idx` sobre `(user_id, due_date)`)
 * devolvía las filas justo en orden de número.
 *
 * Con estos ids el orden lexicográfico da 2, 3, 1; con estos vencimientos el
 * orden por fecha da 2, 1, 3; y el orden de inserción es 3, 1, 2. Ninguno es
 * 1, 2, 3: lo único que puede producir ese orden es el ORDER BY de la
 * consulta. Un plan de cuotas con la 1 venciendo después que la 2 es dato
 * perfectamente cargable: el formulario toma cada vencimiento por separado y
 * nada obliga a que crezcan.
 */
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
  // Igual que en rls.db.test.ts: `user` es la única tabla que se escribe con
  // la conexión de la app y fuera de withUser (la migración 0004 le da a
  // `app_user` una policy sin condición sobre las tablas de better-auth).
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
      initialBalanceUsdRate: "1000",
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
        rate: "1",
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
        rate: "1200",
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
        rate: "1300",
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
        rate: "900",
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
        rate: "1",
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
        rate: "1",
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
      initialBalanceUsdRate: "700",
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
        rate: "1",
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
        rate: "1400",
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
      initialBalanceUsdRate: "1000.0000",
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
          rate: "1",
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
})

describe("queryMovementsView", () => {
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
})

describe("listPaidInstallments", () => {
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
        rate: "1.0000",
      },
      {
        paidDate: "2026-03-01",
        amountCents: 80_00,
        categoryId: CAT.sueldo,
        currency: "USD",
        kind: "income",
        rate: "900.0000",
      },
      {
        paidDate: "2026-04-05",
        amountCents: 120_00,
        categoryId: CAT.alquiler,
        currency: "USD",
        kind: "expense",
        rate: "1300.0000",
      },
      {
        paidDate: SALDO_INICIAL_A,
        amountCents: 200_00,
        categoryId: CAT.sueldo,
        currency: "USD",
        kind: "income",
        rate: "1200.0000",
      },
    ])
  })

  it("trae el rate del movimiento, que es con lo que se consolida a pesos", async () => {
    const pagadas = await listPaidInstallments(USUARIO_A)

    // El rate no es de la cuota (que no tiene): sale del join con el movimiento.
    expect(pagadas.find((p) => p.amountCents === 200_00)?.rate).toBe("1200.0000")
    expect(pagadas.find((p) => p.amountCents === 45_00)?.rate).toBe("1.0000")
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
      rate: "1300.0000",
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

/**
 * El corte `>= initialBalanceDate` está escrito DOS veces: acá en SQL (los dos
 * `gte` de listUsdPositionEvents) y adentro de `buildUsdPositionEvents`
 * (@/lib/position), que tiene sus propios tests unitarios.
 *
 * Esa duplicación es la trampa. Si alguien cambia un `gte` de SQL por `gt`,
 * `src/lib/position.test.ts` queda en verde igual —la parte pura no se tocó— y
 * los movimientos del día exacto del saldo inicial desaparecen de la posición
 * mientras siguen contando en el saldo. El usuario ve dos números distintos en
 * /cambios y en el dashboard, sin un solo error a la vista.
 *
 * Los dos tests del borde son los únicos que se enteran. NO BORRAR NI
 * RELAJAR: si se ponen en rojo, el arreglo es devolver el `gte`.
 */
describe("listUsdPositionEvents", () => {
  const ordenados = (eventos: { date: string; usdCents: number }[]) =>
    [...eventos].sort((a, b) => a.date.localeCompare(b.date) || a.usdCents - b.usdCents)

  it("arma el saldo inicial, los cambios y las cuotas en USD como una sola lista", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // La consulta no promete orden (buildUsdPositionEvents concatena y
    // usdPosition ordena después), así que el test ordena antes de comparar.
    expect(ordenados(eventos)).toEqual([
      // Compra de divisa del día del saldo inicial.
      { date: SALDO_INICIAL_A, usdCents: 50_00, rate: 1100, direction: "in" },
      // El saldo inicial en sí.
      { date: SALDO_INICIAL_A, usdCents: 100_00, rate: 1000, direction: "in" },
      // Cuota cobrada ese mismo día.
      { date: SALDO_INICIAL_A, usdCents: 200_00, rate: 1200, direction: "in" },
      // Cuota pagada de un egreso en dólares.
      { date: "2026-04-05", usdCents: 120_00, rate: 1300, direction: "out" },
      // Venta de divisa.
      { date: "2026-05-20", usdCents: 30_00, rate: 1500, direction: "out" },
    ])
  })

  it("una cuota pagada exactamente en la fecha del saldo inicial entra en la posición", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // Lo único que sostiene esto es el `gte(installment.paidDate,
    // settings.date)` de la consulta: con `gt` este evento desaparece y la
    // posición se queda 200 dólares corta contra el saldo del dashboard.
    expect(eventos).toContainEqual({
      date: SALDO_INICIAL_A,
      usdCents: 200_00,
      rate: 1200,
      direction: "in",
    })
  })

  it("un cambio con fecha exactamente igual a la del saldo inicial entra en la posición", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // Idem, con el `gte(movement.date, settings.date)`.
    expect(eventos).toContainEqual({
      date: SALDO_INICIAL_A,
      usdCents: 50_00,
      rate: 1100,
      direction: "in",
    })
  })

  it("descarta lo anterior a la fecha del saldo inicial", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // El cambio del 2026-02-20 (10_00) y la cuota cobrada el 2026-03-01
    // (80_00) ya están adentro del saldo inicial: contarlos otra vez
    // duplicaría esos dólares.
    expect(eventos.every((e) => e.date >= SALDO_INICIAL_A)).toBe(true)
    expect(eventos.map((e) => e.usdCents)).not.toContain(10_00)
    expect(eventos.map((e) => e.usdCents)).not.toContain(80_00)
  })

  it("una compra es entrada y una venta es salida", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    expect(eventos.find((e) => e.usdCents === 50_00)?.direction).toBe("in") // buy
    expect(eventos.find((e) => e.usdCents === 30_00)?.direction).toBe("out") // sell
  })

  it("una cuota cobrada en USD es entrada y una pagada es salida", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    expect(eventos.find((e) => e.usdCents === 200_00)?.direction).toBe("in") // income
    expect(eventos.find((e) => e.usdCents === 120_00)?.direction).toBe("out") // expense
  })

  it("no cuenta las cuotas impagas", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // La cuota 2 del alquiler (180_00 USD, vence el 2026-05-01) sigue
    // pendiente: esos dólares todavía no salieron de la tenencia.
    expect(eventos.map((e) => e.usdCents)).not.toContain(180_00)
  })

  it("no cuenta las cuotas de movimientos en pesos", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // La cuota 1 del supermercado (45_00, ARS) está pagada el 2026-03-20, o
    // sea después del saldo inicial: lo único que la deja afuera es el filtro
    // por moneda. Sin él entraría como una salida de 45 dólares.
    expect(eventos.map((e) => e.date)).not.toContain("2026-03-20")
    expect(eventos.map((e) => e.usdCents)).not.toContain(45_00)
  })

  it("devuelve una lista vacía si el usuario no completó el onboarding", async () => {
    expect(await listUsdPositionEvents(USUARIO_SIN_ONBOARDING)).toEqual([])
  })

  it("no mezcla eventos de otro usuario", async () => {
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // B tiene saldo inicial de 500_00, un cambio de 444_00 el mismo día que
    // el borde de A y una cuota cobrada de 777_00.
    for (const ajeno of [500_00, 444_00, 777_00]) {
      expect(eventos.map((e) => e.usdCents)).not.toContain(ajeno)
    }
    expect(eventos).toHaveLength(5)
  })

  it("cada usuario siembra su propio saldo inicial", async () => {
    // La contracara: B tiene que ver LO SUYO. Una consulta que devolviera
    // siempre vacío pasaría todos los "no trae nada ajeno" de arriba.
    expect(await listUsdPositionEvents(USUARIO_B)).toContainEqual({
      date: "2026-01-01",
      usdCents: 500_00,
      rate: 700,
      direction: "in",
    })
  })
})

/**
 * Los tipos que devuelve el driver no son un detalle de implementación: la
 * plata son centavos enteros (`bigint` con `mode: "number"`) y los tipos de
 * cambio son `numeric`, que postgres.js entrega como STRING para no perder
 * precisión. Si alguno cambiara en silencio, las cuentas de plata se romperían
 * sin un solo error — `"1300.0000" + 1` es una concatenación, no una suma— y
 * las comparaciones de fecha de toda la app, que son comparaciones de texto,
 * dejarían de funcionar si `date` empezara a llegar como Date.
 */
describe("los tipos que devuelve el driver", () => {
  it("los centavos llegan como number y los numeric como string", async () => {
    const [mov] = await listMovements(USUARIO_A, { kind: "income", from: SALDO_INICIAL_A })

    expect(typeof mov.amountCents).toBe("number")
    expect(mov.amountCents).toBe(200_00)
    expect(typeof mov.rate).toBe("string")
    expect(mov.rate).toBe("1200.0000")
    expect(typeof mov.installments[0].amountCents).toBe("number")
  })

  it("las fechas de negocio llegan como string YYYY-MM-DD y created_at como Date", async () => {
    const [mov] = await listMovements(USUARIO_A, { kind: "income", from: SALDO_INICIAL_A })

    expect(typeof mov.date).toBe("string")
    expect(mov.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof mov.installments[0].dueDate).toBe("string")
    expect(typeof mov.installments[0].paidDate).toBe("string")
    expect(mov.createdAt).toBeInstanceOf(Date)
  })

  it("los saldos iniciales llegan como number y su tipo de cambio como string", async () => {
    const settings = await getSettings(USUARIO_A)

    expect(typeof settings?.initialBalanceArsCents).toBe("number")
    expect(typeof settings?.initialBalanceUsdCents).toBe("number")
    expect(typeof settings?.initialBalanceUsdRate).toBe("string")
    expect(typeof settings?.initialBalanceDate).toBe("string")
  })

  it("los eventos de posición ya vienen con el rate convertido a number", async () => {
    // La conversión del numeric pasa una sola vez, adentro de
    // buildUsdPositionEvents: acá ya tiene que estar hecha.
    const eventos = await listUsdPositionEvents(USUARIO_A)

    expect(eventos).toHaveLength(5)
    expect(eventos.every((e) => typeof e.rate === "number")).toBe(true)
    expect(eventos.every((e) => typeof e.usdCents === "number")).toBe(true)
  })
})

describe("aislamiento por usuario", () => {
  it("el segundo usuario ve sus propios datos, no los del primero", async () => {
    const [cats, movs, pagadas, pendientes, cambios] = await Promise.all([
      listCategories(USUARIO_B, undefined, true),
      listMovements(USUARIO_B),
      listPaidInstallments(USUARIO_B),
      listPendingInstallments(USUARIO_B),
      listExchanges(USUARIO_B),
    ])

    expect(nombres(cats)).toEqual(["Comida", "Sueldo", "Zeta"])
    expect(ids(movs)).toEqual(["q-mov-b-sueldo", "q-mov-b-cambio", "q-mov-b-comida"])
    expect(pagadas.map((p) => p.amountCents).sort((a, b) => a - b)).toEqual([666_00, 777_00])
    expect(pendientes.map((p) => p.amountCents)).toEqual([333_00])
    expect(ids(cambios)).toEqual(["q-mov-b-cambio"])
  })

  it("un usuario sin datos ve vacío en todas las consultas, no los de los demás", async () => {
    const [cats, movs, pagadas, pendientes, cambios, eventos, settings] = await Promise.all([
      listCategories(USUARIO_SIN_ONBOARDING, undefined, true),
      listMovements(USUARIO_SIN_ONBOARDING),
      listPaidInstallments(USUARIO_SIN_ONBOARDING),
      listPendingInstallments(USUARIO_SIN_ONBOARDING),
      listExchanges(USUARIO_SIN_ONBOARDING),
      listUsdPositionEvents(USUARIO_SIN_ONBOARDING),
      getSettings(USUARIO_SIN_ONBOARDING),
    ])

    expect([cats, movs, pagadas, pendientes, cambios, eventos]).toEqual([[], [], [], [], [], []])
    expect(settings).toBeNull()
  })

  it("las filas del primer usuario siguen ahí para su dueño", async () => {
    // Si la siembra se hubiera perdido, todos los "no trae nada ajeno"
    // pasarían por la razón equivocada.
    const propias = await withUser(USUARIO_A, (tx) =>
      tx
        .select({ id: movement.id })
        .from(movement)
        .where(and(eq(movement.userId, USUARIO_A), eq(movement.kind, "exchange"))),
    )

    expect(propias).toHaveLength(3)
  })
})

/**
 * EL CRUCE DE LAS DOS RUTAS. El corte "contar sólo desde initialBalanceDate"
 * está escrito SEIS veces: dos en `computeBalances` (@/lib/balance), dos en
 * `buildUsdPositionEvents` (@/lib/position) y dos en SQL, los `gte` de
 * `listUsdPositionEvents` de este mismo archivo.
 *
 * Cada mitad tenía su cobertura y ninguna cruzaba a la otra:
 * `src/lib/position.test.ts` ata las dos puras entre sí sin tocar la base, y
 * los tests de arriba prueban el SQL contra literales escritos a mano. Con eso,
 * cambiar un `gte` de SQL por `gt` deja las DOS suites en verde y al usuario
 * con /cambios y el dashboard diciendo cosas distintas sobre los mismos
 * dólares.
 *
 * Este bloque es el que se entera: siembra una sola vez (la siembra de A, que
 * ya tiene TRES filas exactamente en `SALDO_INICIAL_A` y dos anteriores) y hace
 * salir el número por los dos caminos completos, cada uno con sus consultas de
 * verdad:
 *
 *   posición: listUsdPositionEvents -> usdPosition
 *   saldo:    getSettings + listPaidInstallments + listExchanges -> computeBalances
 *
 * El mapeo del lado del saldo es el MISMO que hace el dashboard, asserts
 * incluidos: si acá se escribiera a mano, el test probaría una ruta que la app
 * no usa.
 *
 * NO BORRAR NI RELAJAR. Si se pone en rojo, las dos pantallas están mostrando
 * números distintos.
 */
describe("la posición y el saldo salen del mismo dato por dos rutas distintas", () => {
  async function porLasDosRutas(userId: string) {
    const [eventos, settings, pagadas, cambios] = await Promise.all([
      listUsdPositionEvents(userId),
      getSettings(userId),
      listPaidInstallments(userId),
      listExchanges(userId),
    ])

    const position = usdPosition(eventos)

    // Igual que src/app/(app)/dashboard/page.tsx, asserts incluidos.
    const balances = computeBalances(
      {
        initialArsCents: settings!.initialBalanceArsCents,
        initialUsdCents: settings!.initialBalanceUsdCents,
        initialDate: settings!.initialBalanceDate,
      },
      pagadas.map((p) => ({
        paidDate: p.paidDate!,
        currency: assertCurrency(p.currency),
        kind: assertInstallmentMovementKind(p.kind),
        amountCents: p.amountCents,
      })),
      cambios.map((c) => ({
        date: c.date,
        direction: assertExchangeDirection(c.direction),
        usdCents: c.amountCents,
        rate: Number(c.rate),
      })),
    )

    return { position, balances }
  }

  it("los dólares que dice /cambios y los que dice el dashboard son los mismos", async () => {
    const { position, balances } = await porLasDosRutas(USUARIO_A)

    // La misma igualdad que el invariante puro de src/lib/position.test.ts,
    // pero con las dos rutas COMPLETAS: SQL incluido de un lado y las
    // consultas sin filtro de fecha del otro.
    expect(position.oversoldUsdCents).toBe(0)
    expect(position.usdCents - position.oversoldUsdCents).toBe(balances.usdCents)

    // Y el literal, además de la igualdad: dos rutas rotas de la misma manera
    // también coincidirían. US$100 de saldo inicial + US$50 comprados el día
    // del saldo inicial + US$200 cobrados ese mismo día - US$120 pagados el
    // 2026-04-05 - US$30 vendidos el 2026-05-20.
    expect(balances.usdCents).toBe(200_00)
  })

  /**
   * La misma igualdad para el otro usuario, cuyo saldo inicial es de OTRA
   * fecha (2026-01-01) y cuyas filas son todas posteriores. Sin esta mitad,
   * un corte de fecha que ignorara la configuración del usuario y usara una
   * constante pasaría el caso de arriba.
   */
  it("y también para un usuario con otra fecha de saldo inicial", async () => {
    const { position, balances } = await porLasDosRutas(USUARIO_B)

    expect(position.usdCents - position.oversoldUsdCents).toBe(balances.usdCents)
    // US$500 de saldo inicial + US$444 comprados + US$777 cobrados.
    expect(balances.usdCents).toBe(1721_00)
  })

  /**
   * EL BORDE, que es lo que hace que este cruce valga la pena, y cuánto pesa.
   *
   * Las dos filas cargadas EXACTAMENTE en `SALDO_INICIAL_A` —la compra de
   * US$50 y la cuota cobrada de US$200— tienen que contar de los dos lados. El
   * test de arriba ya se rompe si no, pero acá queda escrito el tamaño del
   * desastre: sacarlas de la posición y dejarlas en el saldo —o sea, cambiar un
   * `gte` de SQL por `gt`— deja las dos pantallas separadas por US$250, y
   * encima prende la alerta de sobreventa.
   */
  it("sacar del cálculo las filas del día exacto separa las dos pantallas por US$250", async () => {
    const { balances } = await porLasDosRutas(USUARIO_A)
    const eventos = await listUsdPositionEvents(USUARIO_A)

    // Los eventos del día exacto que vienen de una fila cargada (el saldo
    // inicial en sí también cae ese día, pero no lo filtra ningún `gte`).
    const delBorde = eventos.filter((e) => e.date === SALDO_INICIAL_A && e.usdCents !== 100_00)
    expect(delBorde.map((e) => e.usdCents).sort((a, b) => a - b)).toEqual([50_00, 200_00])

    // Exactamente lo que devolvería listUsdPositionEvents con `gt`.
    const conGt = usdPosition(eventos.filter((e) => !delBorde.includes(e)))

    expect(conGt.usdCents - conGt.oversoldUsdCents).not.toBe(balances.usdCents)
    expect(balances.usdCents - (conGt.usdCents - conGt.oversoldUsdCents)).toBe(250_00)
    // Y no es sólo un número más chico: sin esos dólares, /cambios avisaría de
    // una sobreventa que nunca pasó.
    expect(conGt.oversoldUsdCents).toBeGreaterThan(0)
  })
})

describe("countMovementsByCategory", () => {
  it("cuenta los movimientos de cada categoría del usuario, y nada de otro", async () => {
    const conteo = await countMovementsByCategory(USUARIO_A)

    expect(conteo.get(CAT.comida)).toBe(3)
    expect(conteo.get(CAT.alquiler)).toBe(1)
    // Los cambios de divisa no tienen categoría: no hay clave nula.
    expect([...conteo.keys()].every((id) => id !== null && id.startsWith("q-cat-a-"))).toBe(true)
  })
})

/**
 * Las lecturas que cambió la Fase 3 del plan v2 (tarjetas, migración 0012).
 *
 * Un usuario aparte, sembrado y borrado acá adentro, para no mover los
 * conteos exactos de A de los demás casos. Tiene UNA compra en dólares con
 * tarjeta en dos cuotas: el resumen de enero pagado CON PESOS a $1.500 y el
 * de febrero impago. Es el caso que obliga a las tres consultas a mirar el
 * resumen: la cuota pagada tiene que leerse como pesos al TC del pago (y no
 * como dólares al TC de la compra), no tiene que mover la posición en
 * dólares, y la impaga tiene que traer su resumen y su tarjeta para que el
 * dashboard la agrupe.
 *
 * Todo se siembra en UNA transacción: los triggers de la 0012 son diferidos y
 * piden que la cuota pagada de una compra con tarjeta esté en un resumen
 * pagado el mismo día.
 */
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
          usdPaidRate: "1500",
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
        rate: "1000",
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

  it("una cuota en dólares pagada con pesos se lee como pesos al TC del pago", async () => {
    expect(await listPaidInstallments(USUARIO)).toEqual([
      {
        paidDate: "2026-02-03",
        // US$ 10 a $1.500: $15.000, no US$ 10 a los $1.000 de la compra.
        amountCents: 15_000_00,
        categoryId: CAT_T,
        currency: "ARS",
        kind: "expense",
        rate: "1",
      },
    ])
  })

  it("esa cuota no mueve la posición en dólares: salió de los pesos", async () => {
    const eventos = await listUsdPositionEvents(USUARIO)
    expect(eventos.filter((e) => e.direction === "out")).toEqual([])
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
