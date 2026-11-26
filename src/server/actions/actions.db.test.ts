import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { and, asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

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
import { DEFAULT_CATEGORIES } from "@/lib/default-categories"
import {
  createCard,
  payStatement,
  unpayStatement,
  updateStatementDates,
} from "@/server/actions/cards"
import {
  archiveCategory,
  createCategory,
  moveCategory,
  unarchiveCategory,
  updateCategory,
} from "@/server/actions/categories"
import {
  createExchange,
  createMovement,
  deleteMovement,
  setInstallmentPaid,
  updateMovement,
} from "@/server/actions/movements"
import type { ActionResult } from "@/server/actions/result"
import { saveSettings } from "@/server/actions/settings"

/**
 * Tests de la capa de ESCRITURA contra la base real: las Server Actions con su
 * Zod, su withUser(), su transacción, sus policies de RLS y sus constraints.
 *
 * Sólo se reemplazan las DOS fronteras del framework que no existen fuera del
 * servidor de Next, y nada más:
 *
 * - `next/cache`, porque `revalidatePath()` necesita el contexto de una request.
 *   De paso queda observable: qué rutas revalida cada acción es comportamiento.
 * - `@/server/session`, porque `requireUser()` lee la sesión de las cabeceras
 *   HTTP. Devuelve el usuario de prueba que siembra este archivo, que es el
 *   mismo id que después viaja a `withUser()` y a las policies.
 *
 * Todo lo demás corre de verdad. Si algún día hay que doblar la base, el schema
 * o `withUser`, el test dejó de probar lo que importa.
 *
 * Los ids llevan el prefijo `actions-test-` / `act-` para no pisarse con
 * `src/server/queries.db.test.ts` ni con `src/db/rls.db.test.ts`, que corren
 * contra la misma base.
 */

const sesion = vi.hoisted(() => ({ userId: "" }))

vi.mock("@/server/session", () => ({
  requireUser: async () => ({ id: sesion.userId }),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

/** El actor de casi todos los casos: tiene categorías y va cargando movimientos. */
const USUARIO_A = "actions-test-a"
/** El otro: existe, tiene datos propios y nada de lo de A puede tocarlos. */
const USUARIO_B = "actions-test-b"
/** Recién llegado: sin ajustes y sin categorías, para el onboarding. */
const USUARIO_NUEVO = "actions-test-nuevo"
/**
 * Otro recién llegado, aparte de USUARIO_NUEVO: el caso de carrera necesita
 * arrancar sin ajustes y sin categorías, y los dos tests de onboarding que ya
 * están dejan a USUARIO_NUEVO con las dos cosas.
 */
const USUARIO_CARRERA = "actions-test-carrera"
/**
 * NO se siembra en `user` a propósito. Es la forma de provocar un error real de
 * la base que NO es una violación de unicidad (la FK `category.user_id → user.id`
 * lo rechaza con 23503), que es lo que hace falta para probar que
 * `createCategory` no le dice "nombre repetido" a cualquier cosa que salga mal.
 */
const USUARIO_FANTASMA = "actions-test-fantasma"

/**
 * Un id de sesión que Postgres NO puede leer, y la palanca de los tres `catch`
 * que no se pueden ejercitar con el fantasma.
 *
 * `withUser()` manda el id a la base adentro del claim `{"sub": ...}`, donde el
 * caracter NUL viaja escapado como `\u0000`: `set_config` lo guarda sin
 * chistar, pero la policy —que hace `::json ->> 'sub'` para saber de quién es
 * cada fila— revienta al convertirlo a texto ("unsupported Unicode escape
 * sequence"). Es la misma clase de falla REAL que la fecha "0000-01-01": forma
 * válida, la base la rechaza. No hay ningún doble.
 *
 * Hace falta porque `deleteMovement`, `setInstallmentPaid` y `archiveCategory`
 * no insertan nada: con un usuario que no existe, su UPDATE/DELETE no falla,
 * simplemente no toca ninguna fila y salen por la rama de "no encontramos",
 * que es otro camino. Ésta es la forma de que la escritura falle de verdad.
 *
 * NO se agrega a `USUARIOS_A_LIMPIAR`: no escribe nada (no puede) y limpiarlo
 * haría reventar la limpieza por el mismo motivo.
 */
const USUARIO_QUE_LA_BASE_NO_PUEDE_LEER = "actions-test-\u0000"

const USUARIOS_SEMBRADOS = [USUARIO_A, USUARIO_B, USUARIO_NUEVO, USUARIO_CARRERA]
/** El fantasma nunca llega a escribir nada, pero se limpia igual por las dudas. */
const USUARIOS_A_LIMPIAR = [...USUARIOS_SEMBRADOS, USUARIO_FANTASMA]

/**
 * Las categorías de A se siembran con ids legibles: `createMovement` sólo pide
 * que `categoryId` sea un string no vacío, así que no necesitan ser UUID.
 */
const CAT_A_COMIDA = "act-cat-a-comida"
const CAT_A_SUELDO = "act-cat-a-sueldo"

/**
 * Las filas de B sí llevan UUID: son las que se le pasan a `deleteMovement`,
 * `setInstallmentPaid` y `archiveCategory` en los casos de "recurso ajeno", y
 * esas tres acciones validan el formato del id antes de llegar a la base. Con un
 * id no-UUID el rechazo llegaría por el motivo equivocado y el test no probaría
 * el aislamiento sino la validación.
 */
const CAT_B = randomUUID()
const MOV_B = randomUUID()
const INS_B = randomUUID()

/**
 * La precarga del onboarding, aplanada: desde la Fase 2 cada categoría por
 * default puede traer subcategorías, y las dos cosas son filas de `category`.
 */
const PRECARGA = DEFAULT_CATEGORIES.flatMap((c) => [
  { name: c.name, kind: c.kind, parentName: null as string | null },
  ...(c.children ?? []).map((h) => ({ name: h.name, kind: c.kind, parentName: c.name })),
])

/** Los ids que generan las acciones son `randomUUID()`: v4, variante RFC. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

function comoUsuario(id: string) {
  sesion.userId = id
}

type CampoDeFormulario = string | string[] | undefined

/**
 * Arma el FormData que recibe una Server Action. `undefined` significa CAMPO
 * AUSENTE (el formulario no lo mandó, `formData.get()` devuelve null), que no es
 * lo mismo que campo vacío: varias acciones tienen un `?? ""` o un `?? "1"` que
 * sólo se activa con el ausente. Un array se agrega repetido, que es como viajan
 * las cuotas.
 */
function formulario(campos: Record<string, CampoDeFormulario>): FormData {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue
    for (const uno of Array.isArray(valor) ? valor : [valor]) datos.append(clave, uno)
  }
  return datos
}

/**
 * Estrecha un ActionResult a su rama de rechazo. Si la acción salió bien,
 * revienta acá con un mensaje entendible en vez de dejar que el test siga y
 * falle diez líneas después contra `undefined`.
 */
function rechazo(resultado: ActionResult): {
  message: string
  fieldErrors?: Record<string, string[]>
} {
  if (resultado.ok) throw new Error("la acción tenía que ser rechazada y devolvió ok")
  return resultado
}

/**
 * Varias acciones hacen `console.error` en su camino de error. Apagarlo en la
 * app sería tapar información útil en producción, y dejarlo salir ensucia la
 * salida de los tests. Acá se captura y se devuelve: el ruido se convierte en
 * una aserción más, y encima una que vale — la etiqueta dice POR QUÉ RAMA salió
 * el error, que es justo lo que un mensaje genérico no deja ver.
 */
async function conErroresDeConsola<T>(
  ejecutar: () => Promise<T>,
): Promise<{ resultado: T; etiquetas: string[] }> {
  const espia = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    const resultado = await ejecutar()
    return { resultado, etiquetas: espia.mock.calls.map((argumentos) => String(argumentos[0])) }
  } finally {
    espia.mockRestore()
  }
}

const rutasRevalidadas = () => vi.mocked(revalidatePath).mock.calls

// --------------------------------------------------------------------------
// Lecturas de control. Van por withUser() igual que la app: fuera de ahí, el
// rol `app_user` no ve una sola fila de estas cuatro tablas.
// --------------------------------------------------------------------------

const movimientosPorDescripcion = (userId: string, descripcion: string) =>
  withUser(userId, (tx) =>
    tx
      .select()
      .from(movement)
      .where(and(eq(movement.userId, userId), eq(movement.description, descripcion))),
  )

const movimientosDe = (userId: string) =>
  withUser(userId, (tx) => tx.select().from(movement).where(eq(movement.userId, userId)))

const cambiosDe = (userId: string) =>
  withUser(userId, (tx) =>
    tx
      .select()
      .from(movement)
      .where(and(eq(movement.userId, userId), eq(movement.kind, "exchange"))),
  )

const cuotasDe = (userId: string, movementId: string) =>
  withUser(userId, (tx) =>
    tx
      .select()
      .from(installment)
      .where(eq(installment.movementId, movementId))
      .orderBy(asc(installment.number)),
  )

const cuotaPorId = (userId: string, id: string) =>
  withUser(userId, (tx) => tx.select().from(installment).where(eq(installment.id, id)))

const categoriasDe = (userId: string) =>
  withUser(userId, (tx) => tx.select().from(category).where(eq(category.userId, userId)))

const ajustesDe = (userId: string) =>
  withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)),
  )

/**
 * Ajustes y cantidad de categorías en UNA sola transacción: es el estado que un
 * `saveSettings` rechazado no puede haber movido ni por un lado ni por el otro
 * (ni los ajustes, ni la precarga de categorías).
 */
const estadoDeOnboarding = (userId: string) =>
  withUser(userId, async (tx) => ({
    ajustes: await tx.select().from(userSettings).where(eq(userSettings.userId, userId)),
    cantidadDeCategorias: (
      await tx.select({ id: category.id }).from(category).where(eq(category.userId, userId))
    ).length,
  }))

// --------------------------------------------------------------------------
// Siembra y limpieza
// --------------------------------------------------------------------------

async function sembrarUsuario(id: string) {
  // `user` es la única tabla que se escribe con la conexión de la app y fuera
  // de withUser: la migración 0004 le da a `app_user` una policy sin condición
  // sobre las tablas de better-auth.
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@test.local`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function sembrarDatosDeA() {
  await withUser(USUARIO_A, (tx) =>
    tx.insert(category).values([
      { id: CAT_A_COMIDA, userId: USUARIO_A, name: "Comida", kind: "expense" },
      { id: CAT_A_SUELDO, userId: USUARIO_A, name: "Sueldo", kind: "income" },
    ]),
  )
}

async function sembrarDatosDeB() {
  await withUser(USUARIO_B, async (tx) => {
    await tx.insert(userSettings).values({
      userId: USUARIO_B,
      initialBalanceArsCents: 777_777_00,
      initialBalanceUsdCents: 333_00,
      initialBalanceUsdRate: "888.5",
      initialBalanceDate: "2026-02-02",
      preferredRate: "oficial",
    })
    await tx
      .insert(category)
      .values({ id: CAT_B, userId: USUARIO_B, name: "Comida", kind: "expense" })
    await tx.insert(movement).values({
      id: MOV_B,
      userId: USUARIO_B,
      kind: "expense",
      description: "Gasto de B",
      categoryId: CAT_B,
      date: "2026-03-03",
      currency: "ARS",
      amountCents: 555_00,
      rate: "1",
    })
    await tx.insert(installment).values({
      id: INS_B,
      userId: USUARIO_B,
      movementId: MOV_B,
      number: 1,
      amountCents: 555_00,
      dueDate: "2026-04-04",
    })
  })
}

/** Los ajustes de B tal como quedan sembrados, con el formato que devuelve el driver. */
const AJUSTES_DE_B = {
  userId: USUARIO_B,
  initialBalanceArsCents: 777_777_00,
  initialBalanceUsdCents: 333_00,
  initialBalanceUsdRate: "888.5000",
  initialBalanceDate: "2026-02-02",
  preferredRate: "oficial",
}

/**
 * Borra todo lo que siembra o escribe este archivo. Corre ANTES de sembrar y
 * DESPUÉS de los tests: si una corrida anterior murió por la mitad, la siguiente
 * arranca limpia igual en vez de reventar contra la PK.
 *
 * El orden importa y no es negociable: `movement → category` es ON DELETE
 * RESTRICT, así que primero las cuotas, después los movimientos y recién ahí las
 * categorías. Y las cuatro tablas de la app sólo son visibles desde adentro de
 * withUser().
 */
async function limpiar() {
  for (const id of USUARIOS_A_LIMPIAR) {
    await withUser(id, async (tx) => {
      await tx.delete(installment)
      await tx.delete(movement)
      // Las tarjetas (0012) después de los movimientos y las cuotas que las
      // usan: sus FK son NO ACTION.
      await tx.delete(cardStatement)
      await tx.delete(creditCard)
      await tx.delete(category)
      await tx.delete(userSettings)
    })
  }

  await db.delete(user).where(inArray(user.id, USUARIOS_A_LIMPIAR))
}

beforeAll(async () => {
  await limpiar()
  for (const id of USUARIOS_SEMBRADOS) await sembrarUsuario(id)
  await sembrarDatosDeA()
  await sembrarDatosDeB()
})

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear()
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

// --------------------------------------------------------------------------
// createMovement
// --------------------------------------------------------------------------

/** Alta mínima que entra. Cada caso pisa sólo el campo que quiere romper. */
const ALTA_VALIDA: Record<string, CampoDeFormulario> = {
  kind: "expense",
  description: "Alta base",
  categoryId: CAT_A_COMIDA,
  date: "2026-04-15",
  currency: "USD",
  amountCents: "100",
  rate: "1000",
  installmentAmount: ["10000"],
  installmentDueDate: ["2026-05-15"],
}

describe("createMovement", () => {
  it("guarda exactamente lo que se pidió guardar", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Notebook",
        // "1.234,56" es el formato argentino: mil doscientos treinta y cuatro
        // con cincuenta y seis, no uno con veintitrés.
        amountCents: "1.234,56",
        rate: "1.450,7891",
        // La cuota YA viaja en centavos (la arma buildInstallments del lado del
        // cliente) y tiene que sumar el total: si no, el alta se rechaza. Es
        // exactamente lo que pasó la primera vez que se escribió este test.
        installmentAmount: ["123456"],
      }),
    )

    expect(resultado).toEqual({ ok: true })

    const [fila] = await movimientosPorDescripcion(USUARIO_A, "Notebook")
    expect(fila).toMatchObject({
      userId: USUARIO_A,
      kind: "expense",
      description: "Notebook",
      categoryId: CAT_A_COMIDA,
      date: "2026-04-15",
      currency: "USD",
      // Centavos enteros: 1.234,56 pesos son 123456 centavos, no 1234.56 ni 123.
      amountCents: 123456,
      // El numeric viaja como string y con la escala de la columna (4 decimales).
      rate: "1450.7891",
      direction: null,
    })
    expect(typeof fila.amountCents).toBe("number")
    expect(typeof fila.rate).toBe("string")
    expect(fila.id).toMatch(UUID_V4)
  })

  it("un movimiento en pesos con un tipo de cambio distinto de 1 se rechaza en el campo del TC", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Pesos con TC raro",
        currency: "ARS",
        rate: "1.450",
      }),
    )

    expect(rechazo(resultado).fieldErrors?.rate).toEqual([
      "Un movimiento en pesos siempre lleva tipo de cambio 1.",
    ])
    expect(await movimientosPorDescripcion(USUARIO_A, "Pesos con TC raro")).toEqual([])
  })

  it("las cuotas quedan numeradas en el orden en que se mandaron, con su importe y su vencimiento", async () => {
    comoUsuario(USUARIO_A)

    // Los vencimientos NO son crecientes a propósito: si la acción numerara por
    // fecha en vez de por el orden del formulario, la cuota 1 sería la de marzo
    // y esto se pondría rojo. Con vencimientos crecientes el test pasaría igual
    // con las dos implementaciones. Los importes también son distintos entre sí:
    // atan cada número a su fila.
    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Heladera en cuotas",
        amountCents: "600",
        installmentAmount: ["10000", "20000", "30000"],
        installmentDueDate: ["2026-05-10", "2026-03-10", "2026-08-10"],
      }),
    )

    expect(resultado).toEqual({ ok: true })

    const [fila] = await movimientosPorDescripcion(USUARIO_A, "Heladera en cuotas")
    const cuotas = await cuotasDe(USUARIO_A, fila.id)

    expect(
      cuotas.map((c) => ({
        number: c.number,
        amountCents: c.amountCents,
        dueDate: c.dueDate,
        paid: c.paid,
        paidDate: c.paidDate,
        userId: c.userId,
        movementId: c.movementId,
      })),
    ).toEqual([
      {
        number: 1,
        amountCents: 10000,
        dueDate: "2026-05-10",
        paid: false,
        paidDate: null,
        userId: USUARIO_A,
        movementId: fila.id,
      },
      {
        number: 2,
        amountCents: 20000,
        dueDate: "2026-03-10",
        paid: false,
        paidDate: null,
        userId: USUARIO_A,
        movementId: fila.id,
      },
      {
        number: 3,
        amountCents: 30000,
        dueDate: "2026-08-10",
        paid: false,
        paidDate: null,
        userId: USUARIO_A,
        movementId: fila.id,
      },
    ])
    // La suma de las cuotas es el total del movimiento: la invariante de la
    // sección 4 del spec, verificada sobre lo que quedó en la base.
    expect(cuotas.reduce((total, c) => total + c.amountCents, 0)).toBe(fila.amountCents)
  })

  // NO BORRAR NI RELAJAR. Un centavo de diferencia entre el total y sus cuotas
  // deja el dashboard y el detalle del movimiento mostrando números distintos
  // para siempre, sin un solo error a la vista.
  it("no entra un movimiento cuyas cuotas suman un centavo de MENOS", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Cuotas cortas",
        amountCents: "100",
        installmentAmount: ["5000", "4999"],
        installmentDueDate: ["2026-05-10", "2026-06-10"],
      }),
    )

    expect(rechazo(resultado).fieldErrors?.installments).toEqual([
      "La suma de las cuotas no coincide con el importe total.",
    ])
    expect(await movimientosPorDescripcion(USUARIO_A, "Cuotas cortas")).toEqual([])
  })

  it("no entra un movimiento cuyas cuotas suman un centavo de MÁS", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Cuotas largas",
        amountCents: "100",
        installmentAmount: ["5000", "5001"],
        installmentDueDate: ["2026-05-10", "2026-06-10"],
      }),
    )

    expect(rechazo(resultado).fieldErrors?.installments).toEqual([
      "La suma de las cuotas no coincide con el importe total.",
    ])
    expect(await movimientosPorDescripcion(USUARIO_A, "Cuotas largas")).toEqual([])
  })

  /**
   * NO BORRAR NI RELAJAR. Éste es el test de la transacción, y la falla es REAL,
   * no simulada: "0000-01-01" pasa `isValidIsoDate` (tiene la forma correcta y
   * en el calendario proléptico de JavaScript es un día) pero Postgres no tiene
   * año 0 y rechaza el valor con 22008 al insertar la cuota.
   *
   * O sea: el INSERT del movimiento ya salió bien y el de las cuotas se cae
   * después. Si `withUser` dejara de abrir una transacción —o si alguien
   * partiera la acción en dos escrituras sueltas— el movimiento quedaría
   * guardado sin sus cuotas: un gasto que suma en los totales y no aparece en
   * ningún vencimiento.
   *
   * La segunda parte del test es la que le da sentido a la primera: el MISMO
   * alta, cambiando sólo el vencimiento por uno que Postgres acepta, entra sin
   * problemas. Sin eso, "no quedó nada" también sería el resultado de un
   * movimiento que nunca fue insertable.
   */
  it("si falla la inserción de las cuotas, el movimiento no queda guardado", async () => {
    comoUsuario(USUARIO_A)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      createMovement(
        null,
        formulario({
          ...ALTA_VALIDA,
          description: "Alta a medias",
          installmentDueDate: ["0000-01-01"],
        }),
      ),
    )

    expect(rechazo(resultado).message).toBe("No pudimos guardar el movimiento. Probá de nuevo.")
    // La etiqueta confirma que salió por el catch de la escritura y no por Zod,
    // que no registra nada.
    expect(etiquetas).toEqual(["createMovement"])
    expect(await movimientosPorDescripcion(USUARIO_A, "Alta a medias")).toEqual([])

    const segundoIntento = await createMovement(
      null,
      formulario({ ...ALTA_VALIDA, description: "Alta a medias" }),
    )

    expect(segundoIntento).toEqual({ ok: true })
    // Una sola fila: el intento fallido no dejó una a medias.
    expect(await movimientosPorDescripcion(USUARIO_A, "Alta a medias")).toHaveLength(1)
  })

  it("dos listas de cuotas de distinto largo se rechazan sin tocar la base", async () => {
    comoUsuario(USUARIO_A)

    // Los importes y los vencimientos se emparejan por posición: con largos
    // distintos no hay forma de saber qué importe va con qué vencimiento.
    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Plan descalzado",
        amountCents: "100",
        installmentAmount: ["5000", "5000"],
        installmentDueDate: ["2026-05-10"],
      }),
    )

    expect(rechazo(resultado).message).toBe(
      "El plan de cuotas llegó incompleto. Recargá la página y probá de nuevo.",
    )
    expect(await movimientosPorDescripcion(USUARIO_A, "Plan descalzado")).toEqual([])
  })

  const altasInvalidas: {
    caso: string
    campos: Record<string, CampoDeFormulario>
    campo: string
    mensaje?: string
  }[] = [
    {
      caso: "sin descripción",
      campos: { description: "   " },
      campo: "description",
      mensaje: "Poné una descripción.",
    },
    { caso: "sin categoría", campos: { categoryId: undefined }, campo: "categoryId" },
    { caso: "con la categoría vacía", campos: { categoryId: "" }, campo: "categoryId", mensaje: "Elegí una categoría." },
    {
      caso: "con una fecha que tiene la forma correcta pero no existe",
      campos: { date: "2026-02-30" },
      campo: "date",
      mensaje: "Elegí una fecha válida.",
    },
    {
      caso: "con una fecha en otro formato",
      campos: { date: "15/04/2026" },
      campo: "date",
      mensaje: "Elegí una fecha válida.",
    },
    { caso: "sin fecha", campos: { date: undefined }, campo: "date" },
    {
      caso: "con un importe que no es un número",
      campos: { amountCents: "mil pesos" },
      campo: "amountCents",
      mensaje: "Escribí un importe válido.",
    },
    {
      caso: "sin importe",
      campos: { amountCents: undefined },
      campo: "amountCents",
      mensaje: "Escribí un importe válido.",
    },
    {
      caso: "con un importe negativo",
      campos: { amountCents: "-100" },
      campo: "amountCents",
      mensaje: "El importe no puede ser negativo.",
    },
    { caso: "con un tipo de movimiento que no existe", campos: { kind: "transferencia" }, campo: "kind" },
    { caso: "sin tipo de movimiento", campos: { kind: undefined }, campo: "kind" },
    { caso: "con una moneda que no existe", campos: { currency: "EUR" }, campo: "currency" },
    {
      caso: "con un tipo de cambio que no es un número",
      campos: { rate: "carísimo" },
      campo: "rate",
      mensaje: "Escribí un tipo de cambio válido.",
    },
    {
      caso: "con un tipo de cambio de cero",
      campos: { rate: "0" },
      campo: "rate",
      mensaje: "El tipo de cambio tiene que ser mayor a cero.",
    },
    {
      caso: "sin ninguna cuota",
      campos: { installmentAmount: [], installmentDueDate: [] },
      campo: "installments",
      mensaje: "Tiene que haber al menos una cuota.",
    },
    {
      caso: "con una cuota de importe negativo",
      campos: { installmentAmount: ["-10000"] },
      campo: "installments",
    },
    {
      caso: "con un vencimiento que no existe",
      campos: { installmentDueDate: ["2026-11-31"] },
      campo: "installments",
      mensaje: "Elegí una fecha válida.",
    },
  ]

  it.each(altasInvalidas)(
    "rechaza un alta $caso apuntando al campo, y no escribe nada",
    async ({ campos, campo, mensaje }) => {
      comoUsuario(USUARIO_A)
      const antes = (await movimientosDe(USUARIO_A)).length

      const resultado = await createMovement(null, formulario({ ...ALTA_VALIDA, ...campos }))

      const { fieldErrors } = rechazo(resultado)
      // El error tiene que apuntar al campo que está mal: es lo que el
      // formulario usa para marcar el input, no sólo para mostrar un cartel.
      expect(fieldErrors?.[campo]).toBeDefined()
      if (mensaje) expect(fieldErrors?.[campo]).toContain(mensaje)

      expect(await movimientosDe(USUARIO_A)).toHaveLength(antes)
    },
  )

  it("no se puede crear un movimiento con la categoría de otro usuario", async () => {
    comoUsuario(USUARIO_A)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      createMovement(
        null,
        formulario({ ...ALTA_VALIDA, description: "Categoría ajena", categoryId: CAT_B }),
      ),
    )

    const { message } = rechazo(resultado)
    expect(message).toBe("No pudimos guardar el movimiento. Probá de nuevo.")
    // El mensaje no puede decir si esa categoría existe, ni de quién es: el
    // único que lo sabe es el log del servidor.
    expect(message).not.toMatch(/categor/i)
    expect(message).not.toContain(CAT_B)
    expect(etiquetas).toEqual(["createMovement"])

    expect(await movimientosPorDescripcion(USUARIO_A, "Categoría ajena")).toEqual([])
  })

  /**
   * NO BORRAR NI RELAJAR. `createMovement` NO consulta la categoría antes de
   * insertar: lo que impide guardar un ingreso con una categoría de egresos es
   * la FK compuesta, que lleva `kind` adentro. Desde la interfaz esto no pasa
   * —el desplegable ya viene filtrado por tipo— pero el borde de confianza es
   * la Server Action, no el formulario, y el efecto de que pasara era un
   * dashboard con un ingreso adentro de la torta de egresos.
   *
   * Las dos mitades van juntas a propósito: sin la que entra, la que se rechaza
   * también pasaría con una acción que no guarda nada.
   */
  it("no guarda un ingreso con una categoría de egresos, y sí uno con la del tipo correcto", async () => {
    comoUsuario(USUARIO_A)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      createMovement(
        null,
        formulario({
          ...ALTA_VALIDA,
          kind: "income",
          description: "Ingreso con categoría de egresos",
          // CAT_A_COMIDA es de egresos: el tipo no coincide con el movimiento.
          categoryId: CAT_A_COMIDA,
        }),
      ),
    )

    const { message } = rechazo(resultado)
    expect(message).toBe("No pudimos guardar el movimiento. Probá de nuevo.")
    expect(etiquetas).toEqual(["createMovement"])
    expect(await movimientosPorDescripcion(USUARIO_A, "Ingreso con categoría de egresos")).toEqual(
      [],
    )
    expect(rutasRevalidadas()).toEqual([])

    // El mismo alta con la categoría del tipo correcto entra sin problema.
    const conLaCategoriaCorrecta = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        kind: "income",
        description: "Ingreso con categoría de ingresos",
        categoryId: CAT_A_SUELDO,
      }),
    )

    expect(conLaCategoriaCorrecta).toEqual({ ok: true })
    expect(
      await movimientosPorDescripcion(USUARIO_A, "Ingreso con categoría de ingresos"),
    ).toHaveLength(1)
  })

  it("revalida el dashboard y la pantalla del tipo que se cargó", async () => {
    comoUsuario(USUARIO_A)

    await createMovement(null, formulario({ ...ALTA_VALIDA, description: "Egreso a revalidar" }))
    expect(rutasRevalidadas()).toEqual([["/dashboard"], ["/egresos"]])

    vi.mocked(revalidatePath).mockClear()

    const ingreso = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        kind: "income",
        categoryId: CAT_A_SUELDO,
        description: "Ingreso a revalidar",
      }),
    )

    expect(ingreso).toEqual({ ok: true })
    expect(rutasRevalidadas()).toEqual([["/dashboard"], ["/ingresos"]])

    const [fila] = await movimientosPorDescripcion(USUARIO_A, "Ingreso a revalidar")
    expect(fila.kind).toBe("income")
  })

  it("un alta rechazada no revalida nada", async () => {
    comoUsuario(USUARIO_A)

    await createMovement(null, formulario({ ...ALTA_VALIDA, description: "" }))

    expect(rutasRevalidadas()).toEqual([])
  })
})

// --------------------------------------------------------------------------
// createExchange
// --------------------------------------------------------------------------

const CAMBIO_VALIDO: Record<string, CampoDeFormulario> = {
  direction: "buy",
  date: "2026-07-01",
  usdCents: "100",
  rate: "1500",
}

/** Los cambios no tienen descripción propia: se identifican por su fecha. */
const cambioDelDia = async (userId: string, fecha: string) =>
  (await cambiosDe(userId)).filter((c) => c.date === fecha)

describe("createExchange", () => {
  it("guarda una compra sin categoría, con la dirección que se pidió y sin cuotas", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createExchange(
      null,
      formulario({ ...CAMBIO_VALIDO, date: "2026-07-01", usdCents: "150,75", rate: "1.480,50" }),
    )

    expect(resultado).toEqual({ ok: true })

    const [fila] = await cambioDelDia(USUARIO_A, "2026-07-01")
    expect(fila).toMatchObject({
      userId: USUARIO_A,
      kind: "exchange",
      description: "Compra de dólares",
      // La FK es compuesta (user_id, category_id) con MATCH SIMPLE: una columna
      // nula pasa sin exigir nada.
      categoryId: null,
      date: "2026-07-01",
      currency: "USD",
      amountCents: 15075,
      rate: "1480.5000",
      direction: "buy",
    })

    // Un cambio es instantáneo: no genera cuotas.
    expect(await cuotasDe(USUARIO_A, fila.id)).toEqual([])
    expect(rutasRevalidadas()).toEqual([["/", "layout"]])
  })

  it("una venta se guarda como venta y no como compra", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createExchange(
      null,
      formulario({ ...CAMBIO_VALIDO, direction: "sell", date: "2026-07-02" }),
    )

    expect(resultado).toEqual({ ok: true })

    const [fila] = await cambioDelDia(USUARIO_A, "2026-07-02")
    expect(fila.direction).toBe("sell")
    expect(fila.description).toBe("Venta de dólares")
    expect(await cuotasDe(USUARIO_A, fila.id)).toEqual([])
  })

  const cambiosInvalidos: {
    caso: string
    campos: Record<string, CampoDeFormulario>
    campo: string
    mensaje?: string
  }[] = [
    {
      caso: "de cero dólares",
      campos: { usdCents: "0" },
      campo: "usdCents",
      mensaje: "Poné una cantidad mayor a cero.",
    },
    {
      caso: "de una cantidad negativa",
      campos: { usdCents: "-5" },
      campo: "usdCents",
      mensaje: "El importe no puede ser negativo.",
    },
    {
      caso: "sin cantidad",
      campos: { usdCents: undefined },
      campo: "usdCents",
      mensaje: "Escribí un importe válido.",
    },
    {
      caso: "con tipo de cambio cero",
      campos: { rate: "0" },
      campo: "rate",
      mensaje: "El tipo de cambio tiene que ser mayor a cero.",
    },
    {
      caso: "sin tipo de cambio",
      campos: { rate: undefined },
      campo: "rate",
      mensaje: "Escribí un tipo de cambio válido.",
    },
    { caso: "con una dirección que no existe", campos: { direction: "canjear" }, campo: "direction" },
    { caso: "sin dirección", campos: { direction: undefined }, campo: "direction" },
    {
      caso: "con una fecha que no existe",
      campos: { date: "2026-04-31" },
      campo: "date",
      mensaje: "Elegí una fecha válida.",
    },
  ]

  it.each(cambiosInvalidos)(
    "rechaza un cambio $caso apuntando al campo, y no escribe nada",
    async ({ campos, campo, mensaje }) => {
      comoUsuario(USUARIO_A)
      const antes = (await cambiosDe(USUARIO_A)).length

      const resultado = await createExchange(null, formulario({ ...CAMBIO_VALIDO, ...campos }))

      const { fieldErrors } = rechazo(resultado)
      expect(fieldErrors?.[campo]).toBeDefined()
      if (mensaje) expect(fieldErrors?.[campo]).toContain(mensaje)

      expect(await cambiosDe(USUARIO_A)).toHaveLength(antes)
      expect(rutasRevalidadas()).toEqual([])
    },
  )

  /**
   * El `catch` de `createExchange`, con una falla REAL y no simulada:
   * "0000-01-01" pasa `isValidIsoDate` —tiene la forma correcta y en el
   * calendario proléptico de JavaScript es un día— pero Postgres no tiene año 0
   * y rechaza el valor con 22008. Es la misma palanca que usa el test de la
   * transacción de `createMovement`.
   *
   * Lo que se verifica no es "falló": es QUÉ le llega al usuario. Un cambio de
   * divisa que no entra y no dice nada deja a alguien creyendo que compró
   * dólares que no compró.
   */
  it("si la base rechaza la escritura, lo dice y no deja el cambio a medias", async () => {
    comoUsuario(USUARIO_A)
    const antes = (await cambiosDe(USUARIO_A)).length

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      createExchange(null, formulario({ ...CAMBIO_VALIDO, date: "0000-01-01" })),
    )

    expect(rechazo(resultado).message).toBe("No pudimos registrar la operación.")
    // La etiqueta confirma que salió por el catch de la escritura y no por Zod,
    // que no registra nada.
    expect(etiquetas).toEqual(["createExchange"])
    expect(await cambiosDe(USUARIO_A)).toHaveLength(antes)
    expect(rutasRevalidadas()).toEqual([])
  })
})

// --------------------------------------------------------------------------
// deleteMovement
// --------------------------------------------------------------------------

describe("deleteMovement", () => {
  it("borra el movimiento y se lleva sus cuotas", async () => {
    comoUsuario(USUARIO_A)
    await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Para borrar",
        amountCents: "100",
        installmentAmount: ["4000", "6000"],
        installmentDueDate: ["2026-05-10", "2026-06-10"],
      }),
    )
    const [fila] = await movimientosPorDescripcion(USUARIO_A, "Para borrar")
    expect(await cuotasDe(USUARIO_A, fila.id)).toHaveLength(2)
    // El alta de arriba también revalidó: lo que se mira acá es lo que revalida
    // el borrado.
    vi.mocked(revalidatePath).mockClear()

    const resultado = await deleteMovement(fila.id)

    expect(resultado).toEqual({ ok: true })
    expect(await movimientosPorDescripcion(USUARIO_A, "Para borrar")).toEqual([])
    // Las cuotas caen por el ON DELETE CASCADE de la FK compuesta: si no
    // cayeran, el DELETE del movimiento habría fallado o quedarían huérfanas.
    expect(await cuotasDe(USUARIO_A, fila.id)).toEqual([])
    expect(rutasRevalidadas()).toEqual([["/", "layout"]])
  })

  it("un id que no es un UUID se rechaza sin tocar la base", async () => {
    comoUsuario(USUARIO_A)
    const antes = (await movimientosDe(USUARIO_A)).length

    const resultado = await deleteMovement("no-soy-un-uuid")

    expect(rechazo(resultado).message).toBe("Ese movimiento no existe.")
    expect(await movimientosDe(USUARIO_A)).toHaveLength(antes)
    expect(rutasRevalidadas()).toEqual([])
  })

  it("borrar el movimiento de otro usuario no lo borra y responde igual que si no existiera", async () => {
    comoUsuario(USUARIO_A)

    const inexistente = await deleteMovement(randomUUID())
    const ajeno = await deleteMovement(MOV_B)

    // La respuesta es idéntica en los dos casos: el DELETE es idempotente y no
    // hay forma, desde afuera, de distinguir "no existe" de "es de otro".
    expect(ajeno).toEqual(inexistente)

    // Y lo de B sigue entero, cuota incluida.
    expect(await movimientosPorDescripcion(USUARIO_B, "Gasto de B")).toHaveLength(1)
    expect(await cuotasDe(USUARIO_B, MOV_B)).toHaveLength(1)
  })

  /**
   * El `catch` de `deleteMovement`. La falla es real (ver
   * `USUARIO_QUE_LA_BASE_NO_PUEDE_LEER`) y lo que importa es que el mensaje sea
   * OTRO: "no pudimos borrarlo" y "ese movimiento no existe" son dos cosas
   * distintas, y confundirlas deja al usuario apretando un botón que nunca va a
   * funcionar creyendo que ya lo borró.
   */
  it("si la base rechaza el borrado, el mensaje no es el de un movimiento que no existe", async () => {
    comoUsuario(USUARIO_QUE_LA_BASE_NO_PUEDE_LEER)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      deleteMovement(randomUUID()),
    )

    const { message } = rechazo(resultado)
    expect(message).toBe("No pudimos borrar el movimiento.")
    expect(message).not.toBe("Ese movimiento no existe.")
    // La etiqueta confirma que salió por el catch de la escritura y no por la
    // validación del id, que no registra nada.
    expect(etiquetas).toEqual(["deleteMovement"])
    expect(rutasRevalidadas()).toEqual([])
  })
})

// --------------------------------------------------------------------------
// setInstallmentPaid
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// updateMovement
// --------------------------------------------------------------------------

/**
 * Da de alta un movimiento de tres cuotas y devuelve su fila. Cada test de
 * `updateMovement` arranca del suyo: comparten usuario y tabla, así que ninguno
 * puede depender de lo que dejó el anterior.
 */
async function altaDeTresCuotas(descripcion: string) {
  expect(
    await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: descripcion,
        currency: "ARS",
        rate: "1",
        amountCents: "1.200",
        installmentAmount: ["40000", "40000", "40000"],
        installmentDueDate: ["2026-05-03", "2026-06-15", "2026-07-20"],
      }),
    ),
  ).toEqual({ ok: true })

  const [fila] = await movimientosPorDescripcion(USUARIO_A, descripcion)
  return fila
}

/** Los campos de un formulario de edición sobre un movimiento ya existente. */
const edicion = (id: string, campos: Record<string, CampoDeFormulario> = {}) =>
  formulario({
    id,
    kind: "expense",
    description: "Editado",
    categoryId: CAT_A_COMIDA,
    date: "2026-05-03",
    currency: "ARS",
    rate: "1",
    amountCents: "1.200",
    installmentAmount: ["40000", "40000", "40000"],
    installmentDueDate: ["2026-05-03", "2026-06-15", "2026-07-20"],
    ...campos,
  })

describe("updateMovement", () => {
  it("guarda los campos nuevos y rehace el plan de cuotas", async () => {
    comoUsuario(USUARIO_A)
    const fila = await altaDeTresCuotas("Para editar")
    // Otra categoría del MISMO tipo: la FK compuesta de `movement` lleva `kind`
    // adentro, así que mudar un egreso a una categoría de ingresos no es un
    // caso que esta acción pueda producir (la base lo rechaza).
    expect(await createCategory(null, formulario({ name: "Electro", kind: "expense" }))).toEqual({
      ok: true,
    })
    const [electro] = await categoriaLlamada(USUARIO_A, "Electro")

    const resultado = await updateMovement(
      null,
      edicion(fila.id, {
        description: "Heladera nueva",
        categoryId: electro.id,
        date: "2026-06-01",
        amountCents: "900",
        installmentAmount: ["45000", "45000"],
        installmentDueDate: ["2026-06-01", "2026-07-01"],
      }),
    )

    expect(resultado).toEqual({ ok: true })

    const [despues] = await movimientosPorDescripcion(USUARIO_A, "Heladera nueva")
    expect(despues).toMatchObject({
      id: fila.id,
      description: "Heladera nueva",
      categoryId: electro.id,
      date: "2026-06-01",
      amountCents: 90_000,
    })

    const cuotas = await cuotasDe(USUARIO_A, fila.id)
    expect(cuotas.map((c) => ({ number: c.number, amountCents: c.amountCents, dueDate: c.dueDate })))
      .toEqual([
        { number: 1, amountCents: 45_000, dueDate: "2026-06-01" },
        { number: 2, amountCents: 45_000, dueDate: "2026-07-01" },
      ])
  })

  /**
   * Lo que separa editar de "borrar y volver a cargar": el plan se rehace
   * entero, pero lo que ya se pagó no se desmarca solo. El emparejamiento es
   * por NÚMERO de cuota.
   */
  it("conserva el pago de las cuotas que sobreviven, emparejando por número", async () => {
    comoUsuario(USUARIO_A)
    const fila = await altaDeTresCuotas("Con una paga")
    const cuotas = await cuotasDe(USUARIO_A, fila.id)
    expect(await setInstallmentPaid(cuotas[1].id, true)).toEqual({ ok: true })
    const [pagada] = await cuotaPorId(USUARIO_A, cuotas[1].id)

    expect(await updateMovement(null, edicion(fila.id))).toEqual({ ok: true })

    const despues = await cuotasDe(USUARIO_A, fila.id)
    expect(despues.map((c) => ({ number: c.number, paid: c.paid, paidDate: c.paidDate }))).toEqual([
      { number: 1, paid: false, paidDate: null },
      { number: 2, paid: true, paidDate: pagada.paidDate },
      { number: 3, paid: false, paidDate: null },
    ])
    // Filas nuevas, mismo dato: el reemplazo no puede depender de que los ids
    // se conserven.
    expect(despues.every((c) => c.movementId === fila.id)).toBe(true)
  })

  /**
   * El único caso donde editar puede hacer desaparecer plata: bajar el plan
   * por debajo del número de una cuota ya paga. Se rechaza ANTES de escribir
   * nada, en vez de perder el registro del pago en silencio.
   */
  it("no deja bajar el plan por debajo de la cuota paga más alta, y no toca nada", async () => {
    comoUsuario(USUARIO_A)
    const fila = await altaDeTresCuotas("Con la tercera paga")
    const cuotas = await cuotasDe(USUARIO_A, fila.id)
    expect(await setInstallmentPaid(cuotas[2].id, true)).toEqual({ ok: true })

    const resultado = await updateMovement(
      null,
      edicion(fila.id, {
        description: "No tendría que guardarse",
        amountCents: "800",
        installmentAmount: ["40000", "40000"],
        installmentDueDate: ["2026-05-03", "2026-06-15"],
      }),
    )

    expect(rechazo(resultado).message).toContain("La cuota 3 está paga")
    expect(await movimientosPorDescripcion(USUARIO_A, "No tendría que guardarse")).toEqual([])
    expect(await cuotasDe(USUARIO_A, fila.id)).toHaveLength(3)
    const [despues] = await movimientosPorDescripcion(USUARIO_A, "Con la tercera paga")
    expect(despues.amountCents).toBe(120_000)
  })

  it("una cuota paga que sigue existiendo no bloquea la edición", async () => {
    comoUsuario(USUARIO_A)
    const fila = await altaDeTresCuotas("Bajar sin tocar la paga")
    const cuotas = await cuotasDe(USUARIO_A, fila.id)
    expect(await setInstallmentPaid(cuotas[0].id, true)).toEqual({ ok: true })

    const resultado = await updateMovement(
      null,
      edicion(fila.id, {
        amountCents: "800",
        installmentAmount: ["40000", "40000"],
        installmentDueDate: ["2026-05-03", "2026-06-15"],
      }),
    )

    expect(resultado).toEqual({ ok: true })
    const despues = await cuotasDe(USUARIO_A, fila.id)
    expect(despues).toHaveLength(2)
    expect(despues[0].paid).toBe(true)
  })

  it("un movimiento ajeno o inexistente responde igual, y no se toca", async () => {
    comoUsuario(USUARIO_A)

    const inexistente = await updateMovement(null, edicion(randomUUID()))
    const ajeno = await updateMovement(null, edicion(MOV_B))

    expect(rechazo(inexistente).message).toBe("Ese movimiento no existe.")
    expect(ajeno).toEqual(inexistente)

    const [deB] = await movimientosPorDescripcion(USUARIO_B, "Gasto de B")
    expect(deB).toMatchObject({ description: "Gasto de B", amountCents: 555_00 })
  })

  /**
   * Un cambio de divisa no tiene cuotas ni categoría: reescribirlo con la
   * forma de un movimiento común dejaría a /cambios leyendo una fila que ya no
   * es un cambio. El WHERE lo deja afuera, así que sale por la misma rama que
   * un id que no existe.
   */
  it("un cambio de divisa no se puede editar por acá", async () => {
    comoUsuario(USUARIO_A)
    expect(
      await createExchange(
        null,
        formulario({ direction: "buy", date: "2026-04-01", usdCents: "100", rate: "1000" }),
      ),
    ).toEqual({ ok: true })
    const [cambio] = await cambiosDe(USUARIO_A)

    const resultado = await updateMovement(null, edicion(cambio.id))

    expect(rechazo(resultado).message).toBe("Ese movimiento no existe.")
    const [despues] = await cambiosDe(USUARIO_A)
    expect(despues).toMatchObject({ kind: "exchange", direction: "buy", amountCents: 100_00 })
  })

  it("un id que no es un UUID se rechaza sin tocar la base", async () => {
    comoUsuario(USUARIO_A)

    expect(rechazo(await updateMovement(null, edicion("movimiento-cualquiera"))).message).toBe(
      "Ese movimiento no existe.",
    )
    expect(rutasRevalidadas()).toEqual([])
  })

  it("un plan que no suma el total se rechaza en el campo de las cuotas", async () => {
    comoUsuario(USUARIO_A)
    const fila = await altaDeTresCuotas("Suma que no cierra")

    const resultado = await updateMovement(
      null,
      edicion(fila.id, { installmentAmount: ["40000", "40000", "39999"] }),
    )

    expect(rechazo(resultado).fieldErrors?.installments).toEqual([
      "La suma de las cuotas no coincide con el importe total.",
    ])
    expect(await cuotasDe(USUARIO_A, fila.id)).toHaveLength(3)
  })
})

describe("setInstallmentPaid", () => {
  /** Cuota propia de A, recién creada por la acción (así el id es un UUID real). */
  let cuotaDeA: string

  beforeAll(async () => {
    comoUsuario(USUARIO_A)
    await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Con cuotas para pagar",
        amountCents: "100",
        installmentAmount: ["4000", "6000"],
        installmentDueDate: ["2026-05-10", "2026-06-10"],
      }),
    )
    const [fila] = await movimientosPorDescripcion(USUARIO_A, "Con cuotas para pagar")
    const cuotas = await cuotasDe(USUARIO_A, fila.id)
    cuotaDeA = cuotas[0].id
  })

  /**
   * NO BORRAR NI RELAJAR, Y NO VOLVER A COMPARAR CONTRA `todayInAr()`.
   *
   * Este test comparaba `cuota.paidDate` con `todayInAr()`, o sea con la MISMA
   * función que escribe el valor: pasaba igual con la implementación rota.
   * Cambiar `setInstallmentPaid` a `new Date().toISOString().slice(0, 10)`
   * —el corrimiento por zona horaria que `todayInAr` existe para evitar— sólo
   * se habría notado corriendo la suite entre las 21:00 y las 24:00 de
   * Argentina, que es cuando el reloj UTC ya está en el día siguiente.
   *
   * Además era el único punto de la suite que dependía del reloj real: a la
   * medianoche, el UPDATE y la aserción caían de lados distintos del día.
   *
   * Las dos cosas se arreglan igual: se congela el reloj en un instante que
   * DISTINGUE las dos implementaciones y la fecha esperada va como literal.
   */
  it("marcarla pagada le pone la fecha de hoy en Argentina, no la de UTC", async () => {
    comoUsuario(USUARIO_A)

    // 01:00 UTC del 10 son las 22:00 del 9 en Buenos Aires: el día argentino y
    // el día UTC son distintos. Sólo `Date` queda falso — los timers de verdad
    // los sigue necesitando el driver de Postgres.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-10T01:00:00Z"))

    try {
      // El instante elegido efectivamente distingue las dos implementaciones:
      // sin esto, el test podría estar congelando un momento del día en que
      // las dos dan lo mismo y no probaría nada.
      expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-10")

      const resultado = await setInstallmentPaid(cuotaDeA, true)

      expect(resultado).toEqual({ ok: true })
      const [cuota] = await cuotaPorId(USUARIO_A, cuotaDeA)
      expect(cuota.paid).toBe(true)
      // Literal, y el día ARGENTINO: con `new Date().toISOString()` acá diría
      // "2026-08-10" y este test se pondría rojo, que es todo el punto.
      expect(cuota.paidDate).toBe("2026-08-09")
      expect(rutasRevalidadas()).toEqual([["/", "layout"]])
    } finally {
      vi.useRealTimers()
    }
  })

  it("marcarla dos veces seguidas deja el mismo estado", async () => {
    comoUsuario(USUARIO_A)

    const primera = await setInstallmentPaid(cuotaDeA, true)
    const [despuesDeLaPrimera] = await cuotaPorId(USUARIO_A, cuotaDeA)
    const segunda = await setInstallmentPaid(cuotaDeA, true)
    const [despuesDeLaSegunda] = await cuotaPorId(USUARIO_A, cuotaDeA)

    expect(primera).toEqual({ ok: true })
    expect(segunda).toEqual({ ok: true })
    expect(despuesDeLaSegunda).toEqual(despuesDeLaPrimera)
  })

  it("desmarcarla limpia la fecha de pago", async () => {
    comoUsuario(USUARIO_A)
    await setInstallmentPaid(cuotaDeA, true)

    const resultado = await setInstallmentPaid(cuotaDeA, false)

    expect(resultado).toEqual({ ok: true })
    const [cuota] = await cuotaPorId(USUARIO_A, cuotaDeA)
    expect(cuota.paid).toBe(false)
    // Si quedara la fecha vieja, la cuota volvería a "pendiente" en la lista y
    // seguiría contando como pagada en la posición en dólares.
    expect(cuota.paidDate).toBeNull()
  })

  it("un id que no es un UUID se rechaza sin tocar la base", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await setInstallmentPaid("cuota-cualquiera", true)

    expect(rechazo(resultado).message).toBe("Esa cuota no existe.")
    expect(rutasRevalidadas()).toEqual([])
  })

  it("una cuota ajena responde igual que una que no existe, y no se toca", async () => {
    comoUsuario(USUARIO_A)

    const inexistente = await setInstallmentPaid(randomUUID(), true)
    const ajena = await setInstallmentPaid(INS_B, true)

    expect(inexistente).toEqual({ ok: false, message: "No encontramos esa cuota." })
    // Mismo objeto exacto: el mensaje no filtra si la cuota existe o si es de otro.
    expect(ajena).toEqual(inexistente)

    const [cuotaDeB] = await cuotaPorId(USUARIO_B, INS_B)
    expect(cuotaDeB.paid).toBe(false)
    expect(cuotaDeB.paidDate).toBeNull()
  })

  /**
   * El `catch` de `setInstallmentPaid`. Igual que en `deleteMovement`, lo que
   * se prueba es que la falla de la base NO se confunda con "no encontramos esa
   * cuota": el usuario que ve el segundo mensaje deja de intentar, y el que ve
   * el primero prueba de nuevo. Son consejos opuestos.
   */
  it("si la base rechaza el UPDATE, el mensaje no es el de una cuota que no aparece", async () => {
    comoUsuario(USUARIO_QUE_LA_BASE_NO_PUEDE_LEER)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      setInstallmentPaid(randomUUID(), true),
    )

    const { message } = rechazo(resultado)
    expect(message).toBe("No pudimos actualizar la cuota.")
    expect(message).not.toBe("No encontramos esa cuota.")
    expect(etiquetas).toEqual(["setInstallmentPaid"])
    expect(rutasRevalidadas()).toEqual([])
  })
})

// --------------------------------------------------------------------------
// createCategory / archiveCategory
// --------------------------------------------------------------------------

const categoriaLlamada = async (userId: string, nombre: string) =>
  (await categoriasDe(userId)).filter((c) => c.name === nombre)

describe("createCategory", () => {
  it("crea la categoría con el nombre sin los espacios de los bordes", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createCategory(null, formulario({ name: "  Mascotas  ", kind: "expense" }))

    expect(resultado).toEqual({ ok: true })
    const [fila] = await categoriaLlamada(USUARIO_A, "Mascotas")
    expect(fila).toMatchObject({
      userId: USUARIO_A,
      name: "Mascotas",
      kind: "expense",
      archived: false,
    })
    expect(fila.id).toMatch(UUID_V4)
    expect(rutasRevalidadas()).toEqual([["/", "layout"]])
  })

  it("avisa nombre repetido cuando el nombre está repetido de verdad", async () => {
    comoUsuario(USUARIO_A)
    expect(await createCategory(null, formulario({ name: "Viajes", kind: "expense" }))).toEqual({
      ok: true,
    })

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      createCategory(null, formulario({ name: "Viajes", kind: "expense" })),
    )

    expect(rechazo(resultado).message).toBe("Ya tenés una categoría con ese nombre.")
    expect(etiquetas).toEqual(["createCategory: nombre repetido"])
    // Y no quedó una segunda fila a medias.
    expect(await categoriaLlamada(USUARIO_A, "Viajes")).toHaveLength(1)
  })

  it("el mismo nombre con otro tipo no está repetido: el índice único mira los tres campos", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await createCategory(null, formulario({ name: "Viajes", kind: "income" }))

    expect(resultado).toEqual({ ok: true })
    expect((await categoriaLlamada(USUARIO_A, "Viajes")).map((c) => c.kind).sort()).toEqual([
      "expense",
      "income",
    ])
  })

  /**
   * NO BORRAR NI RELAJAR. La otra dirección del arreglo de `isUniqueViolation`:
   * un error de la base que NO es un 23505 tiene que salir con el mensaje
   * genérico. Decirle "ya tenés una categoría con ese nombre" a alguien cuyo
   * problema es otro no le deja ninguna forma de entender qué pasó.
   *
   * La falla es real: el usuario fantasma no existe en `user`, así que la FK
   * `category_user_id_user_id_fk` rechaza el INSERT con 23503. La policy de RLS
   * lo deja pasar (el user_id coincide con el claim), o sea que el error llega
   * exactamente por donde llegaría cualquier otro problema de la base.
   */
  it("ante un error de la base que no es unicidad da el mensaje genérico", async () => {
    comoUsuario(USUARIO_FANTASMA)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      createCategory(null, formulario({ name: "Genérica", kind: "expense" })),
    )

    expect(rechazo(resultado).message).toBe("No pudimos crear la categoría. Probá de nuevo.")
    expect(etiquetas).toEqual(["createCategory"])
    expect(etiquetas).not.toContain("createCategory: nombre repetido")
  })

  it("archivar una categoría y volver a crearla con el mismo nombre funciona", async () => {
    comoUsuario(USUARIO_A)
    await createCategory(null, formulario({ name: "Ocio", kind: "expense" }))
    const [original] = await categoriaLlamada(USUARIO_A, "Ocio")
    expect(await archiveCategory(original.id)).toEqual({ ok: true })

    // El índice único es PARCIAL (`where archived = false`): con la vieja
    // archivada, el nombre vuelve a estar libre entre las activas.
    const resultado = await createCategory(null, formulario({ name: "Ocio", kind: "expense" }))

    expect(resultado).toEqual({ ok: true })
    const ocios = await categoriaLlamada(USUARIO_A, "Ocio")
    expect(ocios).toHaveLength(2)
    expect(ocios.filter((c) => c.archived).map((c) => c.id)).toEqual([original.id])
    expect(ocios.filter((c) => !c.archived)).toHaveLength(1)

    // Y la nueva vuelve a bloquear: el índice parcial libera el nombre mientras
    // no haya ninguna activa, no para siempre. Va acá adentro y no en un test
    // aparte para que no dependa de que el anterior haya corrido.
    const tercera = await conErroresDeConsola(() =>
      createCategory(null, formulario({ name: "Ocio", kind: "expense" })),
    )

    expect(rechazo(tercera.resultado).message).toBe("Ya tenés una categoría con ese nombre.")
    expect(await categoriaLlamada(USUARIO_A, "Ocio")).toHaveLength(2)
  })

  const categoriasInvalidas: {
    caso: string
    campos: Record<string, CampoDeFormulario>
    campo: string
    mensaje?: string
  }[] = [
    { caso: "sin nombre", campos: { name: "" }, campo: "name", mensaje: "Poné un nombre." },
    { caso: "con un nombre de puros espacios", campos: { name: "    " }, campo: "name", mensaje: "Poné un nombre." },
    { caso: "sin el campo del nombre", campos: { name: undefined }, campo: "name" },
    { caso: "con un nombre de más de 60 caracteres", campos: { name: "x".repeat(61) }, campo: "name" },
    { caso: "con un tipo que no existe", campos: { kind: "mixta" }, campo: "kind" },
    { caso: "sin tipo", campos: { kind: undefined }, campo: "kind" },
  ]

  it.each(categoriasInvalidas)(
    "rechaza crear una categoría $caso apuntando al campo, y no escribe nada",
    async ({ campos, campo, mensaje }) => {
      comoUsuario(USUARIO_A)
      const antes = (await categoriasDe(USUARIO_A)).length

      const resultado = await createCategory(
        null,
        formulario({ name: "Categoría base", kind: "expense", ...campos }),
      )

      const { message, fieldErrors } = rechazo(resultado)
      expect(message).toBe("Revisá los datos.")
      expect(fieldErrors?.[campo]).toBeDefined()
      if (mensaje) expect(fieldErrors?.[campo]).toContain(mensaje)

      expect(await categoriasDe(USUARIO_A)).toHaveLength(antes)
      expect(rutasRevalidadas()).toEqual([])
    },
  )
})

describe("archiveCategory", () => {
  it("archiva la categoría en lugar de borrarla", async () => {
    comoUsuario(USUARIO_A)
    await createCategory(null, formulario({ name: "Para archivar", kind: "expense" }))
    const [fila] = await categoriaLlamada(USUARIO_A, "Para archivar")

    const resultado = await archiveCategory(fila.id)

    expect(resultado).toEqual({ ok: true })
    const [despues] = await categoriaLlamada(USUARIO_A, "Para archivar")
    // La fila sigue estando: los movimientos históricos conservan su categoría.
    expect(despues).toMatchObject({ id: fila.id, archived: true })
  })

  it("archivar una ya archivada no falla", async () => {
    comoUsuario(USUARIO_A)
    // Se crea y se archiva acá adentro: el test no puede depender de la fila
    // que dejó el anterior.
    await createCategory(null, formulario({ name: "Doble archivado", kind: "expense" }))
    const [fila] = await categoriaLlamada(USUARIO_A, "Doble archivado")
    expect(await archiveCategory(fila.id)).toEqual({ ok: true })

    expect(await archiveCategory(fila.id)).toEqual({ ok: true })
    const [despues] = await categoriaLlamada(USUARIO_A, "Doble archivado")
    expect(despues.archived).toBe(true)
  })

  it("un id que no es un UUID se rechaza sin tocar la base", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await archiveCategory("categoria-cualquiera")

    expect(rechazo(resultado).message).toBe("Esa categoría no existe.")
    expect(rutasRevalidadas()).toEqual([])
  })

  it("una categoría ajena responde igual que una que no existe, y no se toca", async () => {
    comoUsuario(USUARIO_A)

    const inexistente = await archiveCategory(randomUUID())
    const ajena = await archiveCategory(CAT_B)

    expect(inexistente).toEqual({ ok: false, message: "No encontramos esa categoría." })
    expect(ajena).toEqual(inexistente)

    const [categoriaDeB] = await categoriaLlamada(USUARIO_B, "Comida")
    expect(categoriaDeB.archived).toBe(false)
  })

  /**
   * El `catch` de `archiveCategory`, el último de los cinco que no ejercitaba
   * nadie. Misma palanca y mismo punto: una falla de la base no puede salir
   * disfrazada de "esa categoría no existe".
   */
  it("si la base rechaza el archivado, el mensaje no es el de una categoría que no aparece", async () => {
    comoUsuario(USUARIO_QUE_LA_BASE_NO_PUEDE_LEER)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      archiveCategory(randomUUID()),
    )

    const { message } = rechazo(resultado)
    expect(message).toBe("No pudimos archivar la categoría.")
    expect(message).not.toBe("No encontramos esa categoría.")
    expect(etiquetas).toEqual(["archiveCategory"])
    expect(rutasRevalidadas()).toEqual([])
  })
})

describe("unarchiveCategory", () => {
  it("devuelve la categoría a las activas", async () => {
    comoUsuario(USUARIO_A)
    await createCategory(null, formulario({ name: "Para desarchivar", kind: "expense" }))
    const [fila] = await categoriaLlamada(USUARIO_A, "Para desarchivar")
    expect(await archiveCategory(fila.id)).toEqual({ ok: true })

    expect(await unarchiveCategory(fila.id)).toEqual({ ok: true })

    const [despues] = await categoriaLlamada(USUARIO_A, "Para desarchivar")
    expect(despues).toMatchObject({ id: fila.id, archived: false })
  })

  /**
   * El modo de falla que archivar no tiene: el índice único es PARCIAL, así
   * que mientras ésta estuvo archivada el nombre quedó libre y se pudo crear
   * otra activa igual. Desarchivarla dejaría dos activas con el mismo nombre y
   * tipo, y Postgres lo rechaza con 23505.
   */
  it("con el nombre ya tomado por una activa se rechaza con su propio mensaje, y la fila sigue archivada", async () => {
    comoUsuario(USUARIO_A)
    await createCategory(null, formulario({ name: "Disputada", kind: "expense" }))
    const [original] = await categoriaLlamada(USUARIO_A, "Disputada")
    expect(await archiveCategory(original.id)).toEqual({ ok: true })
    expect(await createCategory(null, formulario({ name: "Disputada", kind: "expense" }))).toEqual({
      ok: true,
    })

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      unarchiveCategory(original.id),
    )

    expect(rechazo(resultado).message).toBe("Ya tenés una categoría activa con ese nombre.")
    expect(etiquetas).toEqual(["unarchiveCategory: nombre repetido"])
    const disputadas = await categoriaLlamada(USUARIO_A, "Disputada")
    expect(disputadas.filter((c) => c.archived).map((c) => c.id)).toEqual([original.id])
    expect(disputadas.filter((c) => !c.archived)).toHaveLength(1)
  })

  it("una categoría ajena responde igual que una que no existe, y no se toca", async () => {
    comoUsuario(USUARIO_A)

    const inexistente = await unarchiveCategory(randomUUID())
    const ajena = await unarchiveCategory(CAT_B)

    expect(inexistente).toEqual({ ok: false, message: "No encontramos esa categoría." })
    expect(ajena).toEqual(inexistente)
  })

  /**
   * La otra mitad del test de arriba: que exista un mensaje para el nombre
   * repetido no puede convertirse en el mensaje de cualquier falla de la base.
   * Mismo criterio —y misma palanca— que `createCategory`.
   */
  it("si la base falla por otra cosa, el mensaje no es el del nombre repetido", async () => {
    comoUsuario(USUARIO_QUE_LA_BASE_NO_PUEDE_LEER)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      unarchiveCategory(randomUUID()),
    )

    const { message } = rechazo(resultado)
    expect(message).toBe("No pudimos desarchivar la categoría.")
    expect(etiquetas).toEqual(["unarchiveCategory"])
    expect(rutasRevalidadas()).toEqual([])
  })
})

// --------------------------------------------------------------------------
// saveSettings
// --------------------------------------------------------------------------

const AJUSTES_VALIDOS: Record<string, CampoDeFormulario> = {
  initialBalanceArs: "1.500.000,50",
  initialBalanceUsd: "1.200",
  initialBalanceUsdRate: "1.234,5678",
  initialBalanceDate: "2026-01-31",
  preferredRate: "mep",
}

describe("saveSettings", () => {
  it("la primera vez guarda los ajustes y precarga las categorías por default", async () => {
    comoUsuario(USUARIO_NUEVO)
    expect(await categoriasDe(USUARIO_NUEVO)).toEqual([])

    const resultado = await saveSettings(null, formulario(AJUSTES_VALIDOS))

    expect(resultado).toEqual({ ok: true })

    const [fila] = await ajustesDe(USUARIO_NUEVO)
    expect(fila).toEqual({
      userId: USUARIO_NUEVO,
      // "1.500.000,50" es un millón y medio con cincuenta centavos.
      initialBalanceArsCents: 150_000_050,
      // "1.200" con tres dígitos después del punto es mil doscientos.
      initialBalanceUsdCents: 120_000,
      // El TC del saldo inicial se guarda con la precisión de la columna.
      initialBalanceUsdRate: "1234.5678",
      initialBalanceDate: "2026-01-31",
      preferredRate: "mep",
    })

    const categorias = await categoriasDe(USUARIO_NUEVO)
    expect(categorias).toHaveLength(PRECARGA.length)
    // Con su lugar en el árbol: cada subcategoría colgada de su padre.
    const nombrePorId = new Map(categorias.map((c) => [c.id, c.name]))
    const conPadre = (c: { kind: string; name: string; parentName: string | null }) =>
      `${c.kind}:${c.parentName ?? "-"}:${c.name}`
    expect(
      categorias
        .map((c) =>
          conPadre({
            kind: c.kind,
            name: c.name,
            parentName: c.parentId ? (nombrePorId.get(c.parentId) ?? "?") : null,
          }),
        )
        .sort(),
    ).toEqual(PRECARGA.map(conPadre).sort())
    expect(categorias.every((c) => !c.archived)).toBe(true)
    expect(rutasRevalidadas()).toEqual([["/", "layout"]])
  })

  /**
   * La primera pasada va explícita ADENTRO del test, no heredada del anterior.
   * La primera versión de este test se apoyaba en que el de arriba ya hubiera
   * corrido, y corrido en soledad tomaba la rama del INSERT: quedaba en VERDE
   * aunque la precarga de categorías se hubiera colado también en la rama del
   * UPDATE. Se descubrió rompiendo el código a propósito —sacando el `return`
   * temprano de `saveSettings`— y viendo que el test no se enteraba.
   */
  it("la segunda vez actualiza los ajustes y NO duplica las categorías", async () => {
    comoUsuario(USUARIO_NUEVO)

    expect(await saveSettings(null, formulario(AJUSTES_VALIDOS))).toEqual({ ok: true })
    expect(await categoriasDe(USUARIO_NUEVO)).toHaveLength(PRECARGA.length)

    // Sin dólares en el saldo inicial, el TC puede ser cero: la validación
    // cruzada sólo exige un TC mayor a cero cuando hay dólares.
    const resultado = await saveSettings(
      null,
      formulario({
        initialBalanceArs: "0",
        initialBalanceUsd: "0",
        initialBalanceUsdRate: "0",
        initialBalanceDate: "2026-05-05",
        preferredRate: "oficial",
      }),
    )

    expect(resultado).toEqual({ ok: true })

    const [fila] = await ajustesDe(USUARIO_NUEVO)
    expect(fila).toEqual({
      userId: USUARIO_NUEVO,
      initialBalanceArsCents: 0,
      initialBalanceUsdCents: 0,
      initialBalanceUsdRate: "0.0000",
      initialBalanceDate: "2026-05-05",
      preferredRate: "oficial",
    })

    // Una sola fila de ajustes y las mismas categorías: la segunda pasada va
    // por el UPDATE y se saltea la precarga.
    expect(await ajustesDe(USUARIO_NUEVO)).toHaveLength(1)
    expect(await categoriasDe(USUARIO_NUEVO)).toHaveLength(PRECARGA.length)
  })

  /**
   * NO BORRAR NI RELAJAR. `saveSettings` hace select-y-después-decide: mira si
   * ya hay ajustes y recién ahí elige entre INSERT y UPDATE. Con dos clics en
   * "Listo, empezar" casi al mismo tiempo —doble click, doble tab, lo que sea—
   * los dos requests hacen su SELECT antes de que el otro haya insertado nada,
   * así que los dos toman la rama del alta. El segundo INSERT choca contra la
   * PK de `user_settings`, esa transacción entera vuelve atrás, y ese usuario
   * ve "No pudimos guardar los ajustes" con sus ajustes YA guardados por el
   * otro request. El mensaje miente.
   *
   * `Promise.all` no fuerza el orden por sí solo: lo que abre la ventana es que
   * cada llamada hace una consulta real a Postgres antes de decidir qué
   * rama tomar, y ese viaje de I/O tarda muchísimo más que lo que tarda el
   * event loop en arrancar la segunda llamada. Las dos SELECT quedan pedidas
   * antes de que cualquiera de las dos INSERT haya viajado.
   */
  it("dos altas simultáneas del mismo usuario terminan las dos en ok", async () => {
    comoUsuario(USUARIO_CARRERA)
    expect(await categoriasDe(USUARIO_CARRERA)).toEqual([])

    // Dos clics en "Listo, empezar". Los dos requests hacen su SELECT antes de
    // que el otro haya insertado, así que los dos toman la rama del alta.
    const [a, b] = await Promise.all([
      saveSettings(null, formulario(AJUSTES_VALIDOS)),
      saveSettings(null, formulario(AJUSTES_VALIDOS)),
    ])

    expect(a).toEqual({ ok: true })
    expect(b).toEqual({ ok: true })

    // Y las categorías por default quedaron sembradas UNA sola vez.
    expect(await categoriasDe(USUARIO_CARRERA)).toHaveLength(PRECARGA.length)
  })

  it("guardar los ajustes de uno no toca los del otro", async () => {
    // El userId sale de la sesión, no del formulario: no hay campo que mandar
    // para escribir a nombre ajeno. Lo que se verifica es que la escritura caiga
    // del lado correcto de la línea, y por eso el test escribe él mismo en vez
    // de confiar en lo que hayan dejado los anteriores: sin la escritura, esto
    // pasaría en verde incluso con una acción que no guarda nada.
    comoUsuario(USUARIO_NUEVO)
    const guardado = await saveSettings(
      null,
      formulario({ ...AJUSTES_VALIDOS, initialBalanceArs: "42", preferredRate: "blue" }),
    )

    expect(guardado).toEqual({ ok: true })
    expect((await ajustesDe(USUARIO_NUEVO))[0].initialBalanceArsCents).toBe(4200)

    const [deB] = await ajustesDe(USUARIO_B)
    expect(deB).toEqual(AJUSTES_DE_B)
  })

  const ajustesInvalidos: {
    caso: string
    campos: Record<string, CampoDeFormulario>
    campo: string
    mensaje?: string
  }[] = [
    {
      caso: "con una fecha que tiene la forma correcta pero no existe",
      campos: { initialBalanceDate: "2026-06-31" },
      campo: "initialBalanceDate",
      mensaje: "Elegí una fecha válida.",
    },
    {
      caso: "sin fecha",
      campos: { initialBalanceDate: undefined },
      campo: "initialBalanceDate",
      mensaje: "Elegí una fecha válida.",
    },
    {
      caso: "con un saldo en pesos que no es un número",
      campos: { initialBalanceArs: "un montón" },
      campo: "initialBalanceArsCents",
      mensaje: "Escribí un importe válido.",
    },
    {
      caso: "con un saldo en pesos negativo",
      campos: { initialBalanceArs: "-1" },
      campo: "initialBalanceArsCents",
      mensaje: "El importe no puede ser negativo.",
    },
    {
      caso: "con un tipo de cambio que no es un número",
      campos: { initialBalanceUsdRate: "el del blue" },
      campo: "initialBalanceUsdRate",
      mensaje: "Escribí un tipo de cambio válido.",
    },
    {
      caso: "con dólares pero sin decir a qué tipo de cambio",
      campos: { initialBalanceUsd: "500", initialBalanceUsdRate: "0" },
      campo: "initialBalanceUsdRate",
      mensaje:
        "Si cargaste un saldo inicial en dólares, decinos a qué tipo de cambio los compraste.",
    },
    {
      caso: "con una preferencia de cotización que no existe",
      campos: { preferredRate: "cripto" },
      campo: "preferredRate",
    },
    { caso: "sin preferencia de cotización", campos: { preferredRate: undefined }, campo: "preferredRate" },
  ]

  it.each(ajustesInvalidos)(
    "rechaza guardar los ajustes $caso apuntando al campo, y no escribe nada",
    async ({ campos, campo, mensaje }) => {
      comoUsuario(USUARIO_NUEVO)
      const antes = await estadoDeOnboarding(USUARIO_NUEVO)

      const resultado = await saveSettings(null, formulario({ ...AJUSTES_VALIDOS, ...campos }))

      const { message, fieldErrors } = rechazo(resultado)
      expect(message).toBe("Revisá los datos.")
      expect(fieldErrors?.[campo]).toBeDefined()
      if (mensaje) expect(fieldErrors?.[campo]).toContain(mensaje)

      // Ni los ajustes ni la precarga de categorías: un rechazo no deja nada.
      expect(await estadoDeOnboarding(USUARIO_NUEVO)).toEqual(antes)
      expect(rutasRevalidadas()).toEqual([])
    },
  )

  /**
   * El `catch` de `saveSettings`, con la misma palanca que ya usa
   * `createCategory`: el usuario fantasma no existe en `user`, así que la FK
   * `user_settings_user_id_user_id_fk` rechaza el INSERT con 23503. La policy
   * de RLS lo deja pasar (el user_id coincide con el claim), o sea que el error
   * llega por donde llegaría cualquier otro problema de la base.
   *
   * Y verifica lo que sólo se puede verificar acá: la acción escribe DOS cosas
   * —los ajustes y la precarga de categorías— y las dos están en la misma
   * transacción. Si fallara la primera, la segunda no puede haber quedado.
   */
  it("si la base rechaza la escritura, avisa y no deja ni los ajustes ni las categorías precargadas", async () => {
    comoUsuario(USUARIO_FANTASMA)

    const { resultado, etiquetas } = await conErroresDeConsola(() =>
      saveSettings(null, formulario(AJUSTES_VALIDOS)),
    )

    expect(rechazo(resultado).message).toBe("No pudimos guardar los ajustes. Probá de nuevo.")
    expect(etiquetas).toEqual(["saveSettings"])
    expect(await estadoDeOnboarding(USUARIO_FANTASMA)).toEqual({
      ajustes: [],
      cantidadDeCategorias: 0,
    })
    expect(rutasRevalidadas()).toEqual([])
  })
})

// --------------------------------------------------------------------------
// Categorías en árbol (Fase 2 del plan v2)
// --------------------------------------------------------------------------

/** Crea una categoría de egresos por la acción y devuelve su fila. */
async function crearCategoria(nombre: string, campos: Record<string, CampoDeFormulario> = {}) {
  expect(
    await createCategory(null, formulario({ name: nombre, kind: "expense", ...campos })),
  ).toEqual({ ok: true })
  const filas = await categoriaLlamada(USUARIO_A, nombre)
  // La última creada, si el nombre se repite abajo de otros padres.
  return filas.at(-1)!
}

/** Un egreso de una cuota en esa categoría, por la acción. */
async function cargarEgreso(descripcion: string, categoryId: string) {
  return createMovement(
    null,
    formulario({ ...ALTA_VALIDA, description: descripcion, categoryId }),
  )
}

describe("categorías en árbol", () => {
  it("crea una subcategoría con su padre, su color y su icono", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol hogar")

    const hija = await crearCategoria("Árbol alquiler", {
      parentId: padre.id,
      color: "violeta",
      icon: "hogar",
    })

    expect(hija).toMatchObject({ parentId: padre.id, color: "violeta", icon: "hogar" })
  })

  it("un color o un icono que no están en las listas se rechazan", async () => {
    comoUsuario(USUARIO_A)
    const resultado = await createCategory(
      null,
      formulario({ name: "Árbol color raro", kind: "expense", color: "#ff0000" }),
    )
    expect(rechazo(resultado).fieldErrors?.color).toBeDefined()
    expect(await categoriaLlamada(USUARIO_A, "Árbol color raro")).toEqual([])
  })

  it("no deja crear un tercer nivel", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol nivel 1")
    const hija = await crearCategoria("Árbol nivel 2", { parentId: padre.id })

    const resultado = await createCategory(
      null,
      formulario({ name: "Árbol nivel 3", kind: "expense", parentId: hija.id }),
    )

    expect(rechazo(resultado).message).toBe("Una subcategoría no puede tener subcategorías.")
    expect(await categoriaLlamada(USUARIO_A, "Árbol nivel 3")).toEqual([])
  })

  /*
   * §2.1 del plan: la primera subcategoría de una categoría con movimientos
   * pide a dónde pasan, por defecto a una "General" nueva. Sin eso, el padre
   * quedaría con hijas Y con movimientos, que es justo lo que la base prohíbe.
   */
  it("la primera subcategoría de una categoría con movimientos los pasa a una General", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol con movimientos")
    expect(await cargarEgreso("Árbol gasto viejo", padre.id)).toEqual({ ok: true })

    await crearCategoria("Árbol nueva hija", { parentId: padre.id })

    const general = (await categoriaLlamada(USUARIO_A, "General")).find(
      (c) => c.parentId === padre.id,
    )
    expect(general).toBeDefined()
    const [movido] = await movimientosPorDescripcion(USUARIO_A, "Árbol gasto viejo")
    expect(movido.categoryId).toBe(general!.id)
  })

  it("…o a la subcategoría que se está creando, si se elige así", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol con movimientos 2")
    expect(await cargarEgreso("Árbol gasto viejo 2", padre.id)).toEqual({ ok: true })

    const hija = await crearCategoria("Árbol destino", {
      parentId: padre.id,
      movementsTo: "child",
    })

    const [movido] = await movimientosPorDescripcion(USUARIO_A, "Árbol gasto viejo 2")
    expect(movido.categoryId).toBe(hija.id)
    expect(
      (await categoriaLlamada(USUARIO_A, "General")).some((c) => c.parentId === padre.id),
    ).toBe(false)
  })

  it("un movimiento no se puede cargar en una categoría con subcategorías", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol padre lleno")
    await crearCategoria("Árbol hija de lleno", { parentId: padre.id })

    const resultado = await cargarEgreso("Árbol en el padre", padre.id)

    expect(rechazo(resultado).fieldErrors?.categoryId).toEqual([
      "Esa categoría tiene subcategorías: elegí una de ellas.",
    ])
    expect(await movimientosPorDescripcion(USUARIO_A, "Árbol en el padre")).toEqual([])
  })

  it("archivar un padre archiva sus hijas, y desarchivar una hija desarchiva el padre", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol para archivar")
    const hija = await crearCategoria("Árbol hija 1", { parentId: padre.id })
    const hermana = await crearCategoria("Árbol hija 2", { parentId: padre.id })

    expect(await archiveCategory(padre.id)).toEqual({ ok: true })
    const archivadas = (await categoriasDe(USUARIO_A)).filter((c) =>
      [padre.id, hija.id, hermana.id].includes(c.id),
    )
    expect(archivadas.every((c) => c.archived)).toBe(true)

    expect(await unarchiveCategory(hija.id)).toEqual({ ok: true })
    const despues = new Map((await categoriasDe(USUARIO_A)).map((c) => [c.id, c.archived]))
    expect(despues.get(hija.id)).toBe(false)
    expect(despues.get(padre.id)).toBe(false)
    // La hermana queda como estaba: se archivó junto, pero quizás se quiere
    // dejar archivada.
    expect(despues.get(hermana.id)).toBe(true)
  })

  it("mover a… cuelga una categoría de un padre y la vuelve a subir", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol grupo")
    await crearCategoria("Árbol ya adentro", { parentId: padre.id })
    const suelta = await crearCategoria("Árbol suelta")
    expect(await cargarEgreso("Árbol gasto de la suelta", suelta.id)).toEqual({ ok: true })

    expect(
      await moveCategory(null, formulario({ id: suelta.id, parentId: padre.id })),
    ).toEqual({ ok: true })
    let [fila] = await categoriaLlamada(USUARIO_A, "Árbol suelta")
    expect(fila.parentId).toBe(padre.id)
    // Sus movimientos no cambian de categoría: ahora la categoría tiene padre.
    const [gasto] = await movimientosPorDescripcion(USUARIO_A, "Árbol gasto de la suelta")
    expect(gasto.categoryId).toBe(suelta.id)

    expect(await moveCategory(null, formulario({ id: suelta.id, parentId: "" }))).toEqual({
      ok: true,
    })
    ;[fila] = await categoriaLlamada(USUARIO_A, "Árbol suelta")
    expect(fila.parentId).toBeNull()
  })

  it("una categoría con subcategorías no se puede mover abajo de otra", async () => {
    comoUsuario(USUARIO_A)
    const padre = await crearCategoria("Árbol padre que no baja")
    await crearCategoria("Árbol su hija", { parentId: padre.id })
    const otro = await crearCategoria("Árbol otro padre")

    const resultado = await moveCategory(null, formulario({ id: padre.id, parentId: otro.id }))

    expect(rechazo(resultado).message).toMatch(/Tiene subcategorías/)
  })

  it("editar cambia nombre, color e icono, y vaciarlos vuelve a lo automático", async () => {
    comoUsuario(USUARIO_A)
    const categoria = await crearCategoria("Árbol para editar")

    expect(
      await updateCategory(
        null,
        formulario({ id: categoria.id, name: "Árbol editada", color: "azul", icon: "ocio" }),
      ),
    ).toEqual({ ok: true })
    let [fila] = await categoriaLlamada(USUARIO_A, "Árbol editada")
    expect(fila).toMatchObject({ color: "azul", icon: "ocio" })

    expect(
      await updateCategory(
        null,
        formulario({ id: categoria.id, name: "Árbol editada", color: "", icon: "" }),
      ),
    ).toEqual({ ok: true })
    ;[fila] = await categoriaLlamada(USUARIO_A, "Árbol editada")
    expect(fila).toMatchObject({ color: null, icon: null })
  })

  it("no se puede colgar una subcategoría de la categoría de otro usuario", async () => {
    comoUsuario(USUARIO_A)
    const resultado = await createCategory(
      null,
      formulario({ name: "Árbol colgada de B", kind: "expense", parentId: CAT_B }),
    )
    expect(rechazo(resultado).message).toBe("No encontramos esa categoría padre.")
  })
})

// --------------------------------------------------------------------------
// Tarjetas (Fase 3 del plan v2)
// --------------------------------------------------------------------------

/**
 * Las acciones de tarjetas y la compra con tarjeta, contra la base real. Las
 * reglas de fechas (cierre, asignación a resúmenes, cuándo se puede pagar)
 * están probadas sin base en `src/lib/cards.test.ts`; acá se prueba que las
 * acciones las aplican de punta a punta y que la base —RLS, FK compuestas y
 * los triggers de la 0012— acepta lo que la acción escribe.
 *
 * Las tarjetas se llaman "Tarj …" para buscarlas por nombre: `createCard`
 * devuelve sólo `{ ok: true }`, igual que `createCategory`.
 */
describe("tarjetas", () => {
  const tarjetaLlamada = (userId: string, nombre: string) =>
    withUser(userId, (tx) =>
      tx
        .select()
        .from(creditCard)
        .where(and(eq(creditCard.userId, userId), eq(creditCard.name, nombre))),
    )

  const resumenesDe = (userId: string, cardId: string) =>
    withUser(userId, (tx) =>
      tx
        .select()
        .from(cardStatement)
        .where(eq(cardStatement.cardId, cardId))
        .orderBy(asc(cardStatement.period)),
    )

  async function crearTarjeta(nombre: string) {
    comoUsuario(USUARIO_A)
    expect(
      await createCard(
        null,
        formulario({ name: nombre, closingDay: "25", dueDay: "5", creditLimit: "", color: "" }),
      ),
    ).toEqual({ ok: true })
    const [fila] = await tarjetaLlamada(USUARIO_A, nombre)
    return fila
  }

  /** Una compra de $300 en 2 cuotas del 10/01/2026: resúmenes de enero y febrero. */
  async function comprarCon(cardId: string, descripcion: string) {
    comoUsuario(USUARIO_A)
    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: descripcion,
        currency: "ARS",
        rate: "1",
        date: "2026-01-10",
        amountCents: "300",
        creditCardId: cardId,
        // Lo que mande el formulario como vencimiento se ignora: con tarjeta,
        // la cuota vence cuando vence su resumen.
        installmentAmount: ["15000", "15000"],
        installmentDueDate: ["2026-01-10", "2026-01-10"],
      }),
    )
    expect(resultado).toEqual({ ok: true })
    const [mov] = await movimientosPorDescripcion(USUARIO_A, descripcion)
    return mov
  }

  it("una compra con tarjeta crea sus resúmenes y cada cuota vence con el suyo", async () => {
    const card = await crearTarjeta("Tarj compra")
    const mov = await comprarCon(card.id, "Tarj heladera")

    expect(mov.creditCardId).toBe(card.id)
    const resumenes = await resumenesDe(USUARIO_A, card.id)
    expect(resumenes.map((r) => [r.period, r.closingDate, r.dueDate])).toEqual([
      ["2026-01", "2026-01-25", "2026-02-05"],
      ["2026-02", "2026-02-25", "2026-03-05"],
    ])
    const cuotas = await cuotasDe(USUARIO_A, mov.id)
    expect(cuotas.map((c) => [c.statementId, c.dueDate, c.paid])).toEqual([
      [resumenes[0].id, "2026-02-05", false],
      [resumenes[1].id, "2026-03-05", false],
    ])
  })

  it("una cuota con tarjeta no se marca pagada suelta", async () => {
    const card = await crearTarjeta("Tarj suelta")
    const mov = await comprarCon(card.id, "Tarj cuota suelta")
    const [cuota] = await cuotasDe(USUARIO_A, mov.id)

    const resultado = await setInstallmentPaid(cuota.id, true)

    expect(rechazo(resultado).message).toBe(
      "Esta cuota es de una compra con tarjeta: se paga con el resumen.",
    )
  })

  it("pagar el resumen paga sus cuotas, y desmarcarlo las vuelve a dejar impagas", async () => {
    const card = await crearTarjeta("Tarj pago")
    const mov = await comprarCon(card.id, "Tarj pagada")
    const [enero] = await resumenesDe(USUARIO_A, card.id)

    expect(
      await payStatement(
        null,
        formulario({ statementId: enero.id, paidDate: "2026-02-03", mode: "usd" }),
      ),
    ).toEqual({ ok: true })
    let cuotas = await cuotasDe(USUARIO_A, mov.id)
    expect(cuotas.map((c) => [c.paid, c.paidDate])).toEqual([
      [true, "2026-02-03"],
      [false, null],
    ])

    expect(await unpayStatement(enero.id)).toEqual({ ok: true })
    cuotas = await cuotasDe(USUARIO_A, mov.id)
    expect(cuotas.every((c) => !c.paid && c.paidDate === null)).toBe(true)
  })

  it("no se paga un resumen antes de su cierre", async () => {
    const card = await crearTarjeta("Tarj cierre")
    await comprarCon(card.id, "Tarj antes del cierre")
    const [enero] = await resumenesDe(USUARIO_A, card.id)

    const resultado = await payStatement(
      null,
      formulario({ statementId: enero.id, paidDate: "2026-01-20", mode: "usd" }),
    )

    expect(rechazo(resultado).fieldErrors?.paidDate).toBeTruthy()
  })

  it("una compra no puede caer en un resumen ya pagado", async () => {
    const card = await crearTarjeta("Tarj cerrada")
    await comprarCon(card.id, "Tarj primera")
    const [enero] = await resumenesDe(USUARIO_A, card.id)
    await payStatement(
      null,
      formulario({ statementId: enero.id, paidDate: "2026-02-03", mode: "usd" }),
    )

    comoUsuario(USUARIO_A)
    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        description: "Tarj tardía",
        currency: "ARS",
        rate: "1",
        date: "2026-01-12",
        amountCents: "100",
        creditCardId: card.id,
        installmentAmount: ["10000"],
        installmentDueDate: ["2026-01-12"],
      }),
    )

    expect(resultado.ok).toBe(false)
    expect(await movimientosPorDescripcion(USUARIO_A, "Tarj tardía")).toEqual([])
  })

  it("corregir el cierre de un resumen no muda sus compras, ni al editarlas", async () => {
    const card = await crearTarjeta("Tarj ancla")
    const mov = await comprarCon(card.id, "Tarj anclada")
    const [enero] = await resumenesDe(USUARIO_A, card.id)

    // El banco cerró enero el 05/01, antes de la compra del 10/01 que ya
    // estaba adentro. La compra se queda; sólo cambian las fechas.
    expect(
      await updateStatementDates(
        null,
        formulario({
          cardId: card.id,
          period: "2026-01",
          closingDate: "2026-01-05",
          dueDate: "2026-01-15",
        }),
      ),
    ).toEqual({ ok: true })

    // Editar sólo la descripción no recalcula el resumen con el cierre nuevo.
    expect(
      await updateMovement(
        null,
        edicion(mov.id, {
          description: "Tarj anclada editada",
          date: "2026-01-10",
          amountCents: "300",
          creditCardId: card.id,
          installmentAmount: ["15000", "15000"],
          installmentDueDate: ["2026-01-15", "2026-03-05"],
        }),
      ),
    ).toEqual({ ok: true })
    const cuotas = await cuotasDe(USUARIO_A, mov.id)
    expect(cuotas.map((c) => [c.statementId, c.dueDate])).toEqual([
      [enero.id, "2026-01-15"],
      [expect.any(String), "2026-03-05"],
    ])
  })

  it("un ingreso no va con tarjeta", async () => {
    const card = await crearTarjeta("Tarj ingreso")
    comoUsuario(USUARIO_A)
    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        kind: "income",
        categoryId: CAT_A_SUELDO,
        description: "Tarj sueldo",
        creditCardId: card.id,
      }),
    )
    expect(rechazo(resultado).message).toBe("Sólo un egreso se puede pagar con tarjeta.")
  })

  it("no se puede comprar con la tarjeta de otro usuario", async () => {
    const card = await crearTarjeta("Tarj de A")
    comoUsuario(USUARIO_B)
    const resultado = await createMovement(
      null,
      formulario({
        ...ALTA_VALIDA,
        categoryId: CAT_B,
        description: "Tarj ajena",
        creditCardId: card.id,
      }),
    )
    expect(rechazo(resultado).message).toBe("Esa tarjeta no existe.")
    expect(await movimientosPorDescripcion(USUARIO_B, "Tarj ajena")).toEqual([])
  })

  it("dos tarjetas activas no se llaman igual", async () => {
    await crearTarjeta("Tarj repetida")
    const resultado = await createCard(
      null,
      formulario({ name: "Tarj repetida", closingDay: "20", dueDay: "1" }),
    )
    expect(resultado.ok).toBe(false)
  })
})
