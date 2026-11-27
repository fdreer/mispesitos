import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, inArray, sql } from "drizzle-orm"

import { db, sqlClient, withUser, type Tx } from "@/db/client"
import {
  cardStatement,
  category,
  creditCard,
  installment,
  movement,
  user,
  userSettings,
} from "@/db/schema"

const USER_A = "rls-test-user-a"
const USER_B = "rls-test-user-b"
const USUARIOS = [USER_A, USER_B]

type Consultable = Pick<typeof db, "select">

type CasoTabla = {
  nombre: string
  sembrar: (tx: Tx, userId: string) => Promise<unknown>
  leer: (tx: Consultable) => Promise<{ userId: string }[]>
  insertarAjena: (tx: Tx) => Promise<unknown>
  borrar: (tx: Tx) => Promise<unknown>
}

const tablas: CasoTabla[] = [
  {
    nombre: "user_settings",
    sembrar: (tx, u) =>
      tx
        .insert(userSettings)
        .values({ userId: u, initialBalanceDate: "2026-01-01" })
        .onConflictDoNothing(),
    leer: (tx) => tx.select({ userId: userSettings.userId }).from(userSettings),
    insertarAjena: (tx) =>
      tx.insert(userSettings).values({ userId: USER_B, initialBalanceDate: "2026-01-01" }),
    borrar: (tx) => tx.delete(userSettings),
  },
  {
    nombre: "category",
    sembrar: (tx, u) =>
      tx
        .insert(category)
        .values({ id: `cat-${u}`, userId: u, name: "Prueba", kind: "expense" })
        .onConflictDoNothing(),
    leer: (tx) => tx.select({ userId: category.userId }).from(category),
    insertarAjena: (tx) =>
      tx
        .insert(category)
        .values({ id: "cat-robada", userId: USER_B, name: "Robada", kind: "expense" }),
    borrar: (tx) => tx.delete(category),
  },
  {
    nombre: "credit_card",
    sembrar: (tx, u) =>
      tx
        .insert(creditCard)
        .values({ id: `card-${u}`, userId: u, name: "Visa", closingDay: 25, dueDay: 5 })
        .onConflictDoNothing(),
    leer: (tx) => tx.select({ userId: creditCard.userId }).from(creditCard),
    insertarAjena: (tx) =>
      tx
        .insert(creditCard)
        .values({ id: "card-robada", userId: USER_B, name: "Robada", closingDay: 25, dueDay: 5 }),
    borrar: (tx) => tx.delete(creditCard),
  },
  {
    nombre: "card_statement",
    sembrar: (tx, u) =>
      tx
        .insert(cardStatement)
        .values({
          id: `res-${u}`,
          userId: u,
          cardId: `card-${u}`,
          period: "2026-01",
          closingDate: "2026-01-25",
          dueDate: "2026-02-05",
        })
        .onConflictDoNothing(),
    leer: (tx) => tx.select({ userId: cardStatement.userId }).from(cardStatement),
    insertarAjena: (tx) =>
      tx.insert(cardStatement).values({
        id: "res-robado",
        userId: USER_B,
        cardId: `card-${USER_B}`,
        period: "2026-02",
        closingDate: "2026-02-25",
        dueDate: "2026-03-05",
      }),
    borrar: (tx) => tx.delete(cardStatement),
  },
  {
    nombre: "movement",
    sembrar: (tx, u) =>
      tx
        .insert(movement)
        .values({
          id: `mov-${u}`,
          userId: u,
          kind: "expense",
          description: "Prueba",
          categoryId: `cat-${u}`,
          date: "2026-01-05",
          currency: "ARS",
          amountCents: 123_45,
        })
        .onConflictDoNothing(),
    leer: (tx) => tx.select({ userId: movement.userId }).from(movement),
    insertarAjena: (tx) =>
      tx.insert(movement).values({
        id: "mov-robado",
        userId: USER_B,
        kind: "expense",
        description: "Robado",
        categoryId: `cat-${USER_B}`,
        date: "2026-01-05",
        currency: "ARS",
        amountCents: 100_00,
      }),
    borrar: (tx) => tx.delete(movement),
  },
  {
    nombre: "installment",
    sembrar: (tx, u) =>
      tx
        .insert(installment)
        .values({
          id: `ins-${u}`,
          userId: u,
          movementId: `mov-${u}`,
          number: 1,
          amountCents: 123_45,
          dueDate: "2026-02-05",
        })
        .onConflictDoNothing(),
    leer: (tx) => tx.select({ userId: installment.userId }).from(installment),
    insertarAjena: (tx) =>
      tx.insert(installment).values({
        id: "ins-robada",
        userId: USER_B,
        movementId: `mov-${USER_B}`,
        number: 1,
        amountCents: 100_00,
        dueDate: "2026-02-05",
      }),
    borrar: (tx) => tx.delete(installment),
  },
]

/**
 * Devuelve el mensaje de Postgres de una consulta que tiene que ser rechazada.
 *
 * Hace falta porque Drizzle envuelve el error en un `DrizzleQueryError` cuyo
 * `message` es "Failed query: <sql>" y deja el error real en `cause`. Un
 * `.rejects.toThrow(/.../)` mira sólo el `message` de arriba, así que la única
 * forma de atar la aserción a la causa que el test dice estar probando —en vez
 * de aceptar un timeout de red o un error de sintaxis— es desenvolverlo.
 */
async function motivoDelRechazo(consulta: Promise<unknown>): Promise<string> {
  try {
    await consulta
  } catch (error) {
    const causa = (error as { cause?: unknown }).cause
    return String((causa as Error | undefined)?.message ?? (error as Error).message)
  }

  throw new Error("la consulta tenía que ser rechazada y la base la aceptó")
}

async function seedUser(id: string) {
  // `user` sí se puede escribir con la conexión de la app y fuera de withUser:
  // la migración 0004 le da a `app_user` una policy sin condición sobre las
  // tablas de better-auth, porque better-auth las consulta así. El aislamiento
  // por usuario de esas tablas lo hace better-auth, no RLS.
  await db
    .insert(user)
    .values({
      id,
      name: id,
      email: `${id}@test.local`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()

  // Las tablas de la app llevan FORCE: se siembran por withUser(), la misma
  // puerta que usa la app. Un INSERT directo quedaría fuera de toda policy.
  await withUser(id, async (tx) => {
    for (const tabla of tablas) await tabla.sembrar(tx, id)
  })
}

/**
 * Borra todo lo que siembra o escribe este archivo. Corre ANTES de sembrar y
 * DESPUÉS de los tests, igual que en `queries.db.test.ts` y en
 * `actions.db.test.ts`: si una corrida anterior murió por la mitad, la
 * siguiente arranca limpia igual en vez de reventar contra la PK.
 *
 * Sin la pasada de antes, una sola fila sobreviviente de una corrida cortada
 * —`cat-ingreso-rls-test-user-a`, `mov-exchange`— pone en rojo los cuatro
 * casos que esperan EXACTAMENTE una fila por tabla, por una razón que no tiene
 * nada que ver con el código. Un test que se pone rojo por basura de la
 * corrida anterior enseña a ignorar los rojos.
 *
 * Los `borrar` de cada caso van sin WHERE a propósito: adentro de withUser()
 * la policy ya limita lo visible a ese usuario, así que barren también las
 * filas que crean los tests en el medio y no sólo las de la siembra.
 *
 * El orden es el inverso al de siembra y no es negociable: `movement →
 * category` es ON DELETE RESTRICT, así que la categoría no se puede ir antes
 * que el movimiento que la usa. Lo mismo las tarjetas (0012): las FK de
 * movimiento y cuota a tarjeta y resumen son NO ACTION.
 */
async function limpiar() {
  for (const id of USUARIOS) {
    await withUser(id, async (tx) => {
      for (const tabla of [...tablas].reverse()) await tabla.borrar(tx)
    })
  }

  await db.delete(user).where(inArray(user.id, USUARIOS))
}

beforeAll(async () => {
  await limpiar()
  for (const id of USUARIOS) await seedUser(id)
})

afterAll(async () => {
  // La limpieza no puede impedir que se cierre el cliente —si el socket queda
  // abierto, Vitest se queja de handles colgados y la salida deja de estar
  // limpia— pero tampoco puede fallar en silencio: la base es real y
  // COMPARTIDA, y las filas que queden colgadas acá ponen en rojo la próxima
  // corrida. Ya pasó: un fallo acá dejó `rls-test-user-a` colgado y hubo que
  // borrarlo a mano.
  //
  // Por eso el error se guarda, se cierra el cliente igual, y recién después
  // se relanza. Antes sólo se imprimía, y un `console.error` en una suite
  // verde no lo lee nadie.
  let fallaDeLimpieza: unknown

  try {
    await limpiar()
  } catch (error) {
    fallaDeLimpieza = error
  } finally {
    await sqlClient.end()
  }

  if (fallaDeLimpieza !== undefined) {
    // `cause` en vez de tragarse el original: el motivo real —una violación de
    // RESTRICT, un timeout, un guard que rechaza— es lo único que dice qué
    // filas quedaron y por qué. Si además falló un test, Vitest reporta las
    // dos cosas: esto no tapa nada.
    throw new Error(
      "afterAll: falló la limpieza y pueden haber quedado filas de prueba colgadas en la base real.",
      { cause: fallaDeLimpieza },
    )
  }
})

describe("RLS", () => {
  it.each(tablas)("$nombre: un usuario sólo ve sus propias filas", async (tabla) => {
    const filas = await withUser(USER_A, (tx) => tabla.leer(tx))

    expect(filas).toHaveLength(1)
    expect(filas[0].userId).toBe(USER_A)
  })

  it.each(tablas)(
    "$nombre: no se puede insertar una fila a nombre de otro usuario",
    async (tabla) => {
      // La aserción se ata a la causa a propósito: un `.rejects.toThrow()` pelado
      // pinta verde con un timeout de red o un error de sintaxis.
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) => tabla.insertarAjena(tx)),
      )

      expect(motivo).toMatch(/row-level security/)
    },
  )

  it("un SELECT sin WHERE no filtra datos de otro usuario", async () => {
    // Éste es el punto de la segunda capa: la consulta NO filtra por user_id
    // y aun así la base no devuelve nada ajeno.
    const rows = await withUser(USER_B, (tx) =>
      tx.execute(sql`SELECT user_id FROM category`),
    )

    const userIds = [...rows].map((r) => (r as { user_id: string }).user_id)
    expect(userIds).toEqual([USER_B])
  })

  it("no se puede modificar una fila de otro usuario", async () => {
    const updated = await withUser(USER_A, (tx) =>
      tx
        .update(category)
        .set({ name: "Modificada" })
        .where(eq(category.id, `cat-${USER_B}`))
        .returning(),
    )

    expect(updated).toHaveLength(0)
  })

  // NO BORRAR NI RELAJAR.
  //
  // RLS no alcanza para esto y por eso hacen falta las FK compuestas de la
  // migración 0006: los triggers de integridad referencial corren como dueño de
  // la tabla referenciada (`postgres`, con BYPASSRLS), así que una FK de una sola
  // columna se valida contra TODAS las filas, no contra las visibles. Y el
  // WITH CHECK de la policy sólo mira user_id, que acá es el correcto.
  //
  // Si estos dos se ponen en rojo, lo más probable es que alguna FK haya vuelto a
  // ser de una sola columna. El arreglo es volver a hacerla compuesta con
  // user_id, nunca bajar la expectativa: en rojo están diciendo que un usuario
  // puede colgar sus filas de datos de otro.
  it("no se puede referenciar una categoría de otro usuario", async () => {
    const motivo = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(movement).values({
          id: "mov-cruzado",
          // El user_id es el correcto: la policy lo deja pasar. Lo ajeno es la
          // categoría, y eso sólo lo puede frenar la FK compuesta.
          userId: USER_A,
          kind: "expense",
          description: "Categoría ajena",
          categoryId: `cat-${USER_B}`,
          date: "2026-01-05",
          currency: "ARS",
          amountCents: 100_00,
        }),
      ),
    )

    expect(motivo).toMatch(
      /violates foreign key constraint "movement_user_id_kind_category_id_category_user_id_kind_id_fk"/,
    )
  })

  it("no se puede colgar una cuota de un movimiento de otro usuario", async () => {
    const motivo = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(installment).values({
          id: "ins-cruzada",
          userId: USER_A,
          movementId: `mov-${USER_B}`,
          number: 2,
          amountCents: 100_00,
          dueDate: "2026-02-05",
        }),
      ),
    )

    expect(motivo).toMatch(
      /violates foreign key constraint "installment_user_id_movement_id_movement_user_id_id_fk"/,
    )
  })

  // NO BORRAR NI RELAJAR.
  //
  // La FK compuesta lleva `kind` adentro —(user_id, kind, category_id) →
  // category (user_id, kind, id)— y por eso la categoría referenciada tiene que
  // ser del mismo TIPO que el movimiento. Sin eso se podía guardar un ingreso
  // con una categoría de egresos: desde la interfaz no pasa, porque el
  // desplegable ya viene filtrado, pero el borde de confianza es la base y no el
  // formulario. El efecto era un dashboard mostrando un ingreso adentro de la
  // torta de egresos.
  //
  // Si esto se pone en rojo, lo más probable es que la FK haya vuelto a ser sólo
  // (user_id, category_id). El arreglo es volver a meter `kind` adentro, nunca
  // bajar la expectativa.
  it("no se puede guardar un movimiento con una categoría del tipo equivocado", async () => {
    // La categoría sembrada de A es de egresos; el movimiento dice ser ingreso.
    // El user_id es el correcto en las dos filas: lo único desalineado es el
    // tipo, así que ni la policy ni la parte de la FK que mira el dueño lo
    // frenan.
    const motivo = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(movement).values({
          id: "mov-kind-cruzado",
          userId: USER_A,
          kind: "income",
          description: "Ingreso con categoría de egresos",
          categoryId: `cat-${USER_A}`,
          date: "2026-01-07",
          currency: "ARS",
          amountCents: 100_00,
        }),
      ),
    )

    expect(motivo).toMatch(
      /violates foreign key constraint "movement_user_id_kind_category_id_category_user_id_kind_id_fk"/,
    )
  })

  // La contracara del de arriba, y la que le da sentido: el par que SÍ coincide
  // entra. Sin esta mitad, el test anterior también pasaría con una FK rota que
  // rechazara todo.
  it("el par que coincide entra, y el mismo par al revés no", async () => {
    const CAT_INGRESO = `cat-ingreso-${USER_A}`
    const MOV_INGRESO = "mov-ingreso-ok"

    // El INSERT de la categoría va ADENTRO del try: si quedaba afuera y la
    // fila sobrevivía de una corrida cortada, reventaba por clave primaria y
    // el `finally` de limpieza no llegaba a correr nunca — la fila colgada se
    // volvía permanente y ponía en rojo los cuatro casos que esperan
    // exactamente una fila por tabla.
    try {
      await withUser(USER_A, (tx) =>
        tx
          .insert(category)
          .values({ id: CAT_INGRESO, userId: USER_A, name: "Sueldo", kind: "income" }),
      )

      const [fila] = await withUser(USER_A, (tx) =>
        tx
          .insert(movement)
          .values({
            id: MOV_INGRESO,
            userId: USER_A,
            kind: "income",
            description: "Ingreso con categoría de ingresos",
            categoryId: CAT_INGRESO,
            date: "2026-01-08",
            currency: "ARS",
            amountCents: 100_00,
          })
          .returning(),
      )

      expect(fila.categoryId).toBe(CAT_INGRESO)
      expect(fila.kind).toBe("income")

      // Y la misma categoría de ingresos no sirve para un egreso.
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) =>
          tx.insert(movement).values({
            id: "mov-kind-cruzado-al-reves",
            userId: USER_A,
            kind: "expense",
            description: "Egreso con categoría de ingresos",
            categoryId: CAT_INGRESO,
            date: "2026-01-08",
            currency: "ARS",
            amountCents: 100_00,
          }),
        ),
      )

      expect(motivo).toMatch(
        /violates foreign key constraint "movement_user_id_kind_category_id_category_user_id_kind_id_fk"/,
      )
    } finally {
      // Limpieza in situ, igual que en el caso de exchange: estas filas no son
      // parte de la siembra y "un usuario sólo ve sus propias filas" espera
      // exactamente una fila por tabla. El orden no es negociable: la FK
      // movement → category es ON DELETE RESTRICT.
      await withUser(USER_A, async (tx) => {
        await tx.delete(movement).where(eq(movement.id, MOV_INGRESO))
        await tx.delete(category).where(eq(category.id, CAT_INGRESO))
      })
    }
  })

  // La contracara del test de arriba: la FK compuesta NO puede haber roto los
  // movimientos de tipo exchange, que nunca llevan categoría. En Postgres el
  // MATCH SIMPLE por default no exige nada cuando alguna columna de la FK es
  // NULL, y eso es justo lo que se quiere acá.
  //
  // Vale doble desde que `kind` entró en la FK: `kind` de un exchange es
  // "exchange", que NO es un tipo de categoría posible, así que si la FK dejara
  // de ser MATCH SIMPLE —o si alguien le pusiera MATCH FULL— ningún cambio de
  // divisa entraría nunca más.
  it("un movimiento de tipo exchange entra con category_id nulo", async () => {
    try {
      const [fila] = await withUser(USER_A, (tx) =>
        tx
          .insert(movement)
          .values({
            id: "mov-exchange",
            userId: USER_A,
            kind: "exchange",
            description: "Compra de dólares",
            categoryId: null,
            date: "2026-01-06",
            currency: "USD",
            amountCents: 100_00,
            rate: "1450",
            direction: "buy",
          })
          .returning(),
      )

      expect(fila.categoryId).toBeNull()
      expect(fila.userId).toBe(USER_A)
    } finally {
      // Limpieza in situ y en un `finally`: esta fila no forma parte de la
      // siembra de beforeAll, y "movement: un usuario sólo ve sus propias
      // filas" espera exactamente 1 fila para USER_A. Sin el `finally`, una
      // aserción en rojo se saltea el borrado y deja `mov-exchange` colgado:
      // el rojo de un caso se propaga a otros cuatro en la corrida siguiente.
      await withUser(USER_A, (tx) =>
        tx.delete(movement).where(eq(movement.id, "mov-exchange")),
      )
    }
  })

  // NO BORRAR NI RELAJAR.
  //
  // La CHECK de la migración 0009. El spec declara desde siempre que el saldo
  // se calcula por `paid_date` y que la fecha es obligatoria cuando la cuota
  // está pagada, pero hasta la 0009 no lo hacía cumplir NADIE: era una regla
  // sostenida sólo por el código que escribe.
  //
  // Una fila `paid = true, paid_date = NULL` no es un dato incompleto: es una
  // fila que cada pantalla lee distinto. /cambios la excluye en silencio
  // (compara la fecha, y NULL no compara), computeBalances la cuenta igual
  // (sólo mira `paid`), y el dashboard revienta con ella en `monthKey(null)`.
  //
  // Si esto se pone en rojo, lo más probable es que la constraint se haya
  // caído de la base o del schema. El arreglo es volver a ponerla: en rojo,
  // este test está diciendo que los tres `!` de TypeScript que afirman que
  // esta fila no existe vuelven a no tener nada atrás.
  it("no se puede marcar una cuota como pagada sin fecha de pago", async () => {
    const motivo = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(installment).values({
          id: "ins-pagada-sin-fecha",
          userId: USER_A,
          movementId: `mov-${USER_A}`,
          number: 2,
          amountCents: 100_00,
          dueDate: "2026-02-05",
          paid: true,
          paidDate: null,
        }),
      ),
    )

    // Atado al NOMBRE de la constraint, como los tests de las FK: es la única
    // forma de distinguir este rechazo de un timeout o un error de sintaxis.
    expect(motivo).toMatch(
      /violates check constraint "installment_paid_date_required_when_paid"/,
    )
  })

  // El mismo UPDATE que hace `setInstallmentPaid`, pero a medias: marcar
  // pagada sin poner la fecha. Va aparte del INSERT porque es el camino por el
  // que la fila mala aparecería de verdad —la cuota nace impaga y se marca
  // después—, y porque una CHECK mal escrita puede frenar el INSERT y dejar
  // pasar el UPDATE.
  it("tampoco se puede marcar pagada una cuota que ya existe sin ponerle la fecha", async () => {
    const motivo = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx
          .update(installment)
          .set({ paid: true })
          .where(eq(installment.id, `ins-${USER_A}`)),
      ),
    )

    expect(motivo).toMatch(
      /violates check constraint "installment_paid_date_required_when_paid"/,
    )
  })

  // La contracara, y la que le da sentido a las dos de arriba: sin esto, una
  // CHECK rota que rechazara TODA escritura sobre `installment` las pasaría
  // igual. Verifica los dos pares válidos —pagada con fecha, impaga sin
  // fecha— que son exactamente los que escribe `setInstallmentPaid`.
  it("los pares válidos entran: pagada con fecha, e impaga sin fecha", async () => {
    const [pagada] = await withUser(USER_A, (tx) =>
      tx
        .update(installment)
        .set({ paid: true, paidDate: "2026-02-06" })
        .where(eq(installment.id, `ins-${USER_A}`))
        .returning(),
    )

    expect(pagada.paid).toBe(true)
    expect(pagada.paidDate).toBe("2026-02-06")

    // Y desmarcarla vuelve a dejar las dos columnas coherentes.
    const [impaga] = await withUser(USER_A, (tx) =>
      tx
        .update(installment)
        .set({ paid: false, paidDate: null })
        .where(eq(installment.id, `ins-${USER_A}`))
        .returning(),
    )

    expect(impaga.paid).toBe(false)
    expect(impaga.paidDate).toBeNull()
  })

  // NO BORRAR NI RELAJAR.
  //
  // Los tests de arriba consultan desde adentro de withUser(), que hace
  // SET LOCAL ROLE authenticated. Ahí las policies aplican con FORCE o sin él,
  // así que pasarían igual si las tablas sólo tuvieran ENABLE: no dicen nada
  // sobre lo que ve una consulta que se olvidó de pasar por withUser().
  //
  // El dueño de una tabla saltea sus propias policies salvo que la tabla declare
  // FORCE. Hoy la app no conecta como dueño, así que FORCE no es lo que sostiene
  // el aislamiento — lo sostiene el rol `app_user`, y eso lo prueba el test de
  // abajo. FORCE se declara igual porque cubre el día que algo conecte con el
  // rol dueño, y este test verifica que la declaración sigue en pie: si se pone
  // en rojo, el arreglo es volver a ponerla en la migración.
  it("las tablas de la app declaran FORCE ROW LEVEL SECURITY", async () => {
    const rows = await db.execute(sql`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN (
          'user_settings', 'category', 'movement', 'installment',
          'credit_card', 'card_statement'
        )
      ORDER BY relname
    `)

    expect([...rows]).toEqual([
      { relname: "card_statement", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "category", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "credit_card", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "installment", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "movement", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "user_settings", relrowsecurity: true, relforcerowsecurity: true },
    ])
  })

  // NO BORRAR NI RELAJAR. Éste es EL test de la segunda capa: el único que
  // prueba qué pasa cuando alguien se olvida de withUser().
  //
  // Lo que lo hace pasar no es FORCE, es con qué rol conecta la app.
  // DATABASE_URL apunta a `app_user`, un rol sin BYPASSRLS y miembro de
  // `authenticated`: las policies `TO authenticated` le aplican también acá
  // afuera, donde `request.jwt.claims` no está seteado, así que la comparación
  // da NULL y no pasa ninguna fila.
  //
  // Si este test se pone en rojo, lo más probable es que DATABASE_URL haya
  // vuelto a apuntar al rol dueño (`postgres`), que tiene BYPASSRLS y saltea RLS
  // por completo. El arreglo es volver a apuntarla a `app_user`, nunca bajar la
  // expectativa: en rojo, este test está diciendo que cualquier consulta sin
  // WHERE devuelve datos de todos los usuarios.
  //
  // Parametrizado sobre todas las tablas, igual que los tests de aislamiento
  // de adentro de withUser(): antes esto sólo corría sobre `category`, y una
  // policy permisiva de más en cualquiera de las otras tablas sueltas no
  // la agarraba nada.
  it.each(tablas)(
    "fuera de withUser, la conexión de la app no ve filas de $nombre",
    async (tabla) => {
      // Hay filas sembradas de A y de B en cada tabla, y ninguna es visible.
      const filas = await tabla.leer(db)

      expect(filas).toHaveLength(0)
    },
  )

  // El detector automático del caso de arriba: withUser() se niega a correr si el
  // rol de conexión tiene BYPASSRLS o es superusuario, en vez de andar bien y
  // aislar nada. Acá se verifica el hecho que la verificación consulta; que la
  // verificación existe y deja pasar lo prueba cualquier otro test, porque
  // todos usan withUser(). La decisión en sí (qué hacer con rolbypassrls y
  // rolsuper) tiene su propia cobertura con dobles en src/lib/rls-guard.test.ts.
  it("el rol de conexión de la app no tiene BYPASSRLS y no es superusuario", async () => {
    const rows = await db.execute(
      sql`SELECT current_user::text AS rol, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
    )
    const [fila] = [...rows] as { rol: string; rolbypassrls: boolean; rolsuper: boolean }[]

    expect(fila.rolbypassrls).toBe(false)
    expect(fila.rolsuper).toBe(false)
  })
})

/**
 * Las reglas del árbol de categorías (migración 0011, Fase 2 del plan v2).
 * Las cuatro viven en la base y no sólo en las Server Actions, con el mismo
 * criterio que las FK compuestas de la 0006 y la 0008: si alguna se pone en
 * rojo, el arreglo es devolverle la regla a la base, nunca bajar la
 * expectativa.
 *
 * Cada caso siembra sus propias filas con ids `arbol-*` y las borra en su
 * `finally`: la suite de arriba cuenta exactamente una fila por tabla, y una
 * fila colgada de acá la pondría en rojo.
 */
describe("categorías en árbol", () => {
  const ARBOL = ["arbol-padre", "arbol-hija", "arbol-nieta", "arbol-ajena"]
  const MOV = "arbol-mov"

  const cat = (id: string, parentId: string | null = null, name = id) => ({
    id,
    userId: USER_A,
    name,
    kind: "expense",
    parentId,
  })
  const mov = (categoryId: string) => ({
    id: MOV,
    userId: USER_A,
    kind: "expense",
    description: "Prueba del árbol",
    categoryId,
    date: "2026-01-09",
    currency: "ARS",
    amountCents: 100_00,
  })

  /** Una sola sentencia para las categorías: la FK al padre es NO ACTION. */
  async function limpiarArbol() {
    await withUser(USER_A, async (tx) => {
      await tx.delete(movement).where(eq(movement.id, MOV))
      await tx.delete(category).where(inArray(category.id, ARBOL))
    })
  }

  it("una subcategoría no puede colgar de la categoría de otro usuario", async () => {
    try {
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) => tx.insert(category).values(cat("arbol-ajena", `cat-${USER_B}`))),
      )
      expect(motivo).toMatch(
        /violates foreign key constraint "category_user_id_kind_parent_id_category_user_id_kind_id_fk"/,
      )
    } finally {
      await limpiarArbol()
    }
  })

  it("no hay tercer nivel", async () => {
    try {
      await withUser(USER_A, async (tx) => {
        await tx.insert(category).values(cat("arbol-padre"))
        await tx.insert(category).values(cat("arbol-hija", "arbol-padre"))
      })

      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) => tx.insert(category).values(cat("arbol-nieta", "arbol-hija"))),
      )
      expect(motivo).toMatch(/Una subcategoría no puede tener subcategorías/)

      // La otra punta: una categoría con hijas no puede pasar a ser hija.
      await withUser(USER_A, (tx) => tx.insert(category).values(cat("arbol-nieta")))
      const motivoAlReves = await motivoDelRechazo(
        withUser(USER_A, (tx) =>
          tx.update(category).set({ parentId: "arbol-nieta" }).where(eq(category.id, "arbol-padre")),
        ),
      )
      expect(motivoAlReves).toMatch(/Una categoría con subcategorías no puede ser subcategoría/)
    } finally {
      await limpiarArbol()
    }
  })

  it("un movimiento no puede ir a una categoría que tiene subcategorías", async () => {
    try {
      await withUser(USER_A, async (tx) => {
        await tx.insert(category).values(cat("arbol-padre"))
        await tx.insert(category).values(cat("arbol-hija", "arbol-padre"))
      })

      // El trigger es diferido: el rechazo llega en el COMMIT.
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) => tx.insert(movement).values(mov("arbol-padre"))),
      )
      expect(motivo).toMatch(/Un movimiento no puede ir a una categoría que tiene subcategorías/)

      // La contracara: en la hija entra.
      await withUser(USER_A, (tx) => tx.insert(movement).values(mov("arbol-hija")))
    } finally {
      await limpiarArbol()
    }
  })

  /*
   * §2.1 del plan: crear la primera subcategoría de una categoría con
   * movimientos obliga a pasarlos. Suelta, la hija no entra; en la misma
   * transacción que mueve los movimientos, sí — para eso los dos triggers de
   * "sólo hojas" son diferidos.
   */
  it("la primera hija de una categoría con movimientos sólo entra si se los pasa en la misma transacción", async () => {
    try {
      await withUser(USER_A, async (tx) => {
        await tx.insert(category).values(cat("arbol-padre"))
        await tx.insert(movement).values(mov("arbol-padre"))
      })

      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) => tx.insert(category).values(cat("arbol-hija", "arbol-padre"))),
      )
      expect(motivo).toMatch(/La categoría padre todavía tiene movimientos/)

      await withUser(USER_A, async (tx) => {
        await tx.insert(category).values(cat("arbol-hija", "arbol-padre"))
        await tx.update(movement).set({ categoryId: "arbol-hija" }).where(eq(movement.id, MOV))
      })

      const [fila] = await withUser(USER_A, (tx) =>
        tx.select({ categoryId: movement.categoryId }).from(movement).where(eq(movement.id, MOV)),
      )
      expect(fila.categoryId).toBe("arbol-hija")
    } finally {
      await limpiarArbol()
    }
  })

  it("dos hermanas no se llaman igual, pero dos primas sí", async () => {
    try {
      await withUser(USER_A, async (tx) => {
        await tx.insert(category).values(cat("arbol-padre"))
        await tx.insert(category).values(cat("arbol-nieta"))
        await tx.insert(category).values(cat("arbol-hija", "arbol-padre", "General"))
        // Prima: mismo nombre, otro padre.
        await tx.insert(category).values(cat("arbol-ajena", "arbol-nieta", "General"))
      })

      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) =>
          tx.update(category).set({ parentId: "arbol-padre" }).where(eq(category.id, "arbol-ajena")),
        ),
      )
      expect(motivo).toMatch(/category_active_unique/)
    } finally {
      await limpiarArbol()
    }
  })
})

/**
 * Las reglas de las tarjetas (migración 0012, Fase 3 del plan v2). Igual que
 * las del árbol de categorías, viven en la base y no sólo en las Server
 * Actions: si alguna se pone en rojo, el arreglo es devolverle la regla a la
 * base, nunca bajar la expectativa.
 *
 * Las FK compuestas con user_id frenan colgar filas propias de una tarjeta o
 * un resumen ajeno, con el mismo criterio que la 0006 y la 0008. Los triggers
 * diferidos de `installment_matches_statement` sostienen que la cuota de una
 * compra con tarjeta esté en un resumen de ESA tarjeta, venza cuando vence el
 * resumen y se pague junto con él (§1.4: las cuotas con tarjeta no se pagan
 * sueltas). Como son DEFERRABLE INITIALLY DEFERRED, el rechazo llega en el
 * COMMIT de withUser() y no en la sentencia: por eso cada caso escribe todo
 * adentro de una sola transacción y espera el rechazo de la transacción entera.
 *
 * Cada caso siembra sus filas con ids `tarj-*` y las borra en su `finally`.
 */
describe("tarjetas", () => {
  const CARD = "tarj-card"
  const OTRA = "tarj-otra"
  const RES = "tarj-res"
  const RES_OTRA = "tarj-res-otra"
  const MOV = "tarj-mov"
  const INS = "tarj-ins"

  const tarjeta = (id: string) => ({ id, userId: USER_A, name: id, closingDay: 25, dueDay: 5 })
  const resumen = (id: string, cardId: string) => ({
    id,
    userId: USER_A,
    cardId,
    period: "2026-03",
    closingDate: "2026-03-25",
    dueDate: "2026-04-05",
  })
  const compra = (creditCardId: string | null) => ({
    id: MOV,
    userId: USER_A,
    kind: "expense",
    description: "Compra con tarjeta",
    categoryId: `cat-${USER_A}`,
    date: "2026-03-10",
    currency: "ARS",
    amountCents: 100_00,
    creditCardId,
  })
  const cuota = (statementId: string | null, dueDate = "2026-04-05") => ({
    id: INS,
    userId: USER_A,
    movementId: MOV,
    number: 1,
    amountCents: 100_00,
    dueDate,
    statementId,
  })

  /** Un solo withUser con todo: los triggers diferidos corren al COMMIT. */
  async function sembrar(fn: (tx: Tx) => Promise<unknown>) {
    return withUser(USER_A, async (tx) => {
      await tx.insert(creditCard).values([tarjeta(CARD), tarjeta(OTRA)])
      await tx.insert(cardStatement).values([resumen(RES, CARD), resumen(RES_OTRA, OTRA)])
      await fn(tx)
    })
  }

  async function limpiarTarjetas() {
    await withUser(USER_A, async (tx) => {
      await tx.delete(installment).where(eq(installment.id, INS))
      await tx.delete(movement).where(eq(movement.id, MOV))
      await tx.delete(cardStatement).where(inArray(cardStatement.id, [RES, RES_OTRA]))
      await tx.delete(creditCard).where(inArray(creditCard.id, [CARD, OTRA]))
    })
  }

  it("un movimiento no puede ir a la tarjeta de otro usuario", async () => {
    try {
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) => tx.insert(movement).values(compra(`card-${USER_B}`))),
      )
      expect(motivo).toMatch(
        /violates foreign key constraint "movement_user_id_credit_card_id_credit_card_user_id_id_fk"/,
      )
    } finally {
      await limpiarTarjetas()
    }
  })

  it("una cuota no puede caer en el resumen de otro usuario", async () => {
    try {
      const motivo = await motivoDelRechazo(
        sembrar(async (tx) => {
          await tx.insert(movement).values(compra(CARD))
          await tx.insert(installment).values(cuota(`res-${USER_B}`))
        }),
      )
      expect(motivo).toMatch(
        /violates foreign key constraint "installment_user_id_statement_id_card_statement_user_id_id_fk"/,
      )
    } finally {
      await limpiarTarjetas()
    }
  })

  it("un resumen no puede ser de la tarjeta de otro usuario", async () => {
    try {
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) => tx.insert(cardStatement).values(resumen(RES, `card-${USER_B}`))),
      )
      expect(motivo).toMatch(/violates foreign key constraint/)
    } finally {
      await limpiarTarjetas()
    }
  })

  it("sólo los egresos van con tarjeta", async () => {
    try {
      const motivo = await motivoDelRechazo(
        sembrar((tx) =>
          tx.insert(movement).values({
            ...compra(CARD),
            kind: "income",
            categoryId: null,
          }),
        ),
      )
      // Puede saltar antes la FK de la categoría por tipo: lo que importa es
      // que la base no lo acepte. Con category_id nulo, lo frena el CHECK.
      expect(motivo).toMatch(/movement_credit_card_only_expense|violates/)
    } finally {
      await limpiarTarjetas()
    }
  })

  it("la cuota de una compra con tarjeta tiene que estar en un resumen", async () => {
    try {
      const motivo = await motivoDelRechazo(
        sembrar(async (tx) => {
          await tx.insert(movement).values(compra(CARD))
          await tx.insert(installment).values(cuota(null))
        }),
      )
      expect(motivo).toMatch(/Cada cuota de una compra con tarjeta tiene que estar en un resumen/)
    } finally {
      await limpiarTarjetas()
    }
  })

  it("la cuota no puede estar en el resumen de otra tarjeta", async () => {
    try {
      const motivo = await motivoDelRechazo(
        sembrar(async (tx) => {
          await tx.insert(movement).values(compra(CARD))
          await tx.insert(installment).values(cuota(RES_OTRA))
        }),
      )
      expect(motivo).toMatch(/La cuota está en un resumen de otra tarjeta/)
    } finally {
      await limpiarTarjetas()
    }
  })

  it("la cuota vence cuando vence su resumen", async () => {
    try {
      const motivo = await motivoDelRechazo(
        sembrar(async (tx) => {
          await tx.insert(movement).values(compra(CARD))
          await tx.insert(installment).values(cuota(RES, "2026-04-10"))
        }),
      )
      expect(motivo).toMatch(/Una cuota con tarjeta vence cuando vence su resumen/)
    } finally {
      await limpiarTarjetas()
    }
  })

  it("una cuota con tarjeta no se paga suelta: se paga con el resumen", async () => {
    try {
      await sembrar(async (tx) => {
        await tx.insert(movement).values(compra(CARD))
        await tx.insert(installment).values(cuota(RES))
      })
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) =>
          tx
            .update(installment)
            .set({ paid: true, paidDate: "2026-04-01" })
            .where(eq(installment.id, INS)),
        ),
      )
      expect(motivo).toMatch(/Una cuota con tarjeta se paga junto con su resumen/)
    } finally {
      await limpiarTarjetas()
    }
  })

  it("pagar el resumen con sus cuotas en la misma transacción entra, y pagado no cambia de fechas", async () => {
    try {
      await sembrar(async (tx) => {
        await tx.insert(movement).values(compra(CARD))
        await tx.insert(installment).values(cuota(RES))
      })
      await withUser(USER_A, async (tx) => {
        await tx
          .update(cardStatement)
          .set({ paidDate: "2026-04-01" })
          .where(eq(cardStatement.id, RES))
        await tx
          .update(installment)
          .set({ paid: true, paidDate: "2026-04-01" })
          .where(eq(installment.id, INS))
      })

      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) =>
          tx.update(cardStatement).set({ dueDate: "2026-04-08" }).where(eq(cardStatement.id, RES)),
        ),
      )
      expect(motivo).toMatch(/El resumen está pagado: desmarcalo para cambiarle las fechas/)
    } finally {
      // Para poder borrar, primero se desmarca: la cuota pagada no puede
      // quedar sin su resumen pagado ni al revés.
      await withUser(USER_A, async (tx) => {
        await tx
          .update(installment)
          .set({ paid: false, paidDate: null })
          .where(eq(installment.id, INS))
        await tx.update(cardStatement).set({ paidDate: null }).where(eq(cardStatement.id, RES))
      }).catch(() => {})
      await limpiarTarjetas()
    }
  })

  it("dos tarjetas activas no se llaman igual, pero una archivada libera el nombre", async () => {
    try {
      const motivo = await motivoDelRechazo(
        withUser(USER_A, (tx) =>
          tx.insert(creditCard).values([tarjeta(CARD), { ...tarjeta(OTRA), name: CARD }]),
        ),
      )
      expect(motivo).toMatch(/credit_card_active_name_unique/)

      await withUser(USER_A, (tx) =>
        tx
          .insert(creditCard)
          .values([{ ...tarjeta(CARD), archived: true }, { ...tarjeta(OTRA), name: CARD }]),
      )
    } finally {
      await limpiarTarjetas()
    }
  })

  it("usd_paid_ars_cents sólo entra cuando el resumen está pagado y es positivo", async () => {
    try {
      await sembrar(async (tx) => {
        await tx.insert(movement).values(compra(CARD))
        await tx.insert(installment).values(cuota(RES))
      })

      const sinFecha = await motivoDelRechazo(
        withUser(USER_A, (tx) =>
          tx
            .update(cardStatement)
            .set({ usdPaidArsCents: 150_000_00 })
            .where(eq(cardStatement.id, RES)),
        ),
      )
      expect(sinFecha).toMatch(/card_statement_usd_paid_ars_only_when_paid/)

      const cero = await motivoDelRechazo(
        withUser(USER_A, async (tx) => {
          await tx
            .update(cardStatement)
            .set({ paidDate: "2026-04-01", usdPaidArsCents: 0 })
            .where(eq(cardStatement.id, RES))
          await tx
            .update(installment)
            .set({ paid: true, paidDate: "2026-04-01" })
            .where(eq(installment.id, INS))
        }),
      )
      expect(cero).toMatch(/card_statement_usd_paid_ars_only_when_paid/)

      await withUser(USER_A, async (tx) => {
        await tx
          .update(cardStatement)
          .set({ paidDate: "2026-04-01", usdPaidArsCents: 150_000_00 })
          .where(eq(cardStatement.id, RES))
        await tx
          .update(installment)
          .set({ paid: true, paidDate: "2026-04-01" })
          .where(eq(installment.id, INS))
      })
    } finally {
      await withUser(USER_A, async (tx) => {
        await tx
          .update(installment)
          .set({ paid: false, paidDate: null })
          .where(eq(installment.id, INS))
        await tx
          .update(cardStatement)
          .set({ paidDate: null, usdPaidArsCents: null })
          .where(eq(cardStatement.id, RES))
      }).catch(() => {})
      await limpiarTarjetas()
    }
  })
})

describe("tipo de cambio sólo en cambios de divisa", () => {
  it("rechaza rate en ingresos/egresos y lo exige positivo en exchange", async () => {
    const egresoConRate = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(movement).values({
          id: "mov-rate-egreso",
          userId: USER_A,
          kind: "expense",
          description: "Con TC",
          categoryId: `cat-${USER_A}`,
          date: "2026-01-10",
          currency: "USD",
          amountCents: 100_00,
          rate: "1200",
        }),
      ),
    )
    expect(egresoConRate).toMatch(/movement_rate_only_exchange/)

    const exchangeSinRate = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(movement).values({
          id: "mov-rate-exchange-null",
          userId: USER_A,
          kind: "exchange",
          description: "Sin TC",
          categoryId: null,
          date: "2026-01-10",
          currency: "USD",
          amountCents: 100_00,
          rate: null,
          direction: "buy",
        }),
      ),
    )
    expect(exchangeSinRate).toMatch(/movement_rate_only_exchange/)

    const exchangeCero = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(movement).values({
          id: "mov-rate-exchange-cero",
          userId: USER_A,
          kind: "exchange",
          description: "TC cero",
          categoryId: null,
          date: "2026-01-10",
          currency: "USD",
          amountCents: 100_00,
          rate: "0",
          direction: "buy",
        }),
      ),
    )
    expect(exchangeCero).toMatch(/movement_rate_only_exchange/)
  })
})
