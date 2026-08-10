import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { and, asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db, sqlClient, withUser } from "@/db/client"
import { category, installment, movement, user, userSettings } from "@/db/schema"
import { todayInAr } from "@/lib/dates"
import { DEFAULT_CATEGORIES } from "@/lib/default-categories"
import { archiveCategory, createCategory } from "@/server/actions/categories"
import {
  createExchange,
  createMovement,
  deleteMovement,
  setInstallmentPaid,
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
 * NO se siembra en `user` a propósito. Es la forma de provocar un error real de
 * la base que NO es una violación de unicidad (la FK `category.user_id → user.id`
 * lo rechaza con 23503), que es lo que hace falta para probar que
 * `createCategory` no le dice "nombre repetido" a cualquier cosa que salga mal.
 */
const USUARIO_FANTASMA = "actions-test-fantasma"

const USUARIOS_SEMBRADOS = [USUARIO_A, USUARIO_B, USUARIO_NUEVO]
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
})

// --------------------------------------------------------------------------
// setInstallmentPaid
// --------------------------------------------------------------------------

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

  it("marcarla pagada le pone la fecha de hoy en Argentina", async () => {
    comoUsuario(USUARIO_A)

    const resultado = await setInstallmentPaid(cuotaDeA, true)

    expect(resultado).toEqual({ ok: true })
    const [cuota] = await cuotaPorId(USUARIO_A, cuotaDeA)
    expect(cuota.paid).toBe(true)
    // `todayInAr()`, no `new Date()`: a la madrugada argentina el reloj UTC ya
    // está en el día siguiente.
    expect(cuota.paidDate).toBe(todayInAr())
    expect(rutasRevalidadas()).toEqual([["/", "layout"]])
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
    expect(categorias).toHaveLength(DEFAULT_CATEGORIES.length)
    expect(categorias.map((c) => `${c.kind}:${c.name}`).sort()).toEqual(
      DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name}`).sort(),
    )
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
    expect(await categoriasDe(USUARIO_NUEVO)).toHaveLength(DEFAULT_CATEGORIES.length)

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

    // Una sola fila de ajustes y las mismas 15 categorías: la segunda pasada va
    // por el UPDATE y se saltea la precarga.
    expect(await ajustesDe(USUARIO_NUEVO)).toHaveLength(1)
    expect(await categoriasDe(USUARIO_NUEVO)).toHaveLength(DEFAULT_CATEGORIES.length)
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
})
