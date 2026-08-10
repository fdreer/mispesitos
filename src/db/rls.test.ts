import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"

import { db, sqlClient, withUser, type Tx } from "@/db/client"
import { category, installment, movement, user, userSettings } from "@/db/schema"

const USER_A = "rls-test-user-a"
const USER_B = "rls-test-user-b"

/**
 * Las cuatro policies de la app son copias del mismo predicado sobre tablas
 * distintas. Antes la cobertura de comportamiento era sólo sobre `category`: un
 * error en una sola de las otras tres no lo agarraba nada. Cada caso describe
 * cómo sembrar, leer, escribir a nombre ajeno y limpiar una tabla, y los tests
 * de aislamiento se corren parametrizados sobre las cuatro.
 *
 * El orden del array es el de siembra (respeta las FK); la limpieza va al revés.
 */
type CasoTabla = {
  nombre: string
  sembrar: (tx: Tx, userId: string) => Promise<unknown>
  leer: (tx: Tx) => Promise<{ userId: string }[]>
  /** Un INSERT válido salvo por el user_id, que es el de otro usuario. */
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
          rate: "1",
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
        rate: "1",
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

  // Las 4 tablas de la app llevan FORCE: se siembran por withUser(), la misma
  // puerta que usa la app. Un INSERT directo quedaría fuera de toda policy.
  await withUser(id, async (tx) => {
    for (const tabla of tablas) await tabla.sembrar(tx, id)
  })
}

beforeAll(async () => {
  await seedUser(USER_A)
  await seedUser(USER_B)
})

afterAll(async () => {
  // Las filas de la app se borran por withUser (afuera no son visibles) y en el
  // orden inverso al de siembra: `movement -> category` es ON DELETE RESTRICT,
  // así que la categoría no se puede ir antes que el movimiento que la usa.
  for (const id of [USER_A, USER_B]) {
    await withUser(id, async (tx) => {
      for (const tabla of [...tablas].reverse()) await tabla.borrar(tx)
    })
  }

  await db.delete(user).where(eq(user.id, USER_A))
  await db.delete(user).where(eq(user.id, USER_B))
  await sqlClient.end()
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
          rate: "1",
        }),
      ),
    )

    expect(motivo).toMatch(
      /violates foreign key constraint "movement_user_id_category_id_category_user_id_id_fk"/,
    )
  })

  it("no se puede colgar una cuota de un movimiento de otro usuario", async () => {
    const motivo = await motivoDelRechazo(
      withUser(USER_A, (tx) =>
        tx.insert(installment).values({
          id: "ins-cruzada",
          userId: USER_A,
          movementId: `mov-${USER_B}`,
          number: 1,
          amountCents: 100_00,
          dueDate: "2026-02-05",
        }),
      ),
    )

    expect(motivo).toMatch(
      /violates foreign key constraint "installment_user_id_movement_id_movement_user_id_id_fk"/,
    )
  })

  // La contracara del test de arriba: la FK compuesta NO puede haber roto los
  // movimientos de tipo exchange, que nunca llevan categoría. En Postgres el
  // MATCH SIMPLE por default no exige nada cuando alguna columna de la FK es
  // NULL, y eso es justo lo que se quiere acá.
  it("un movimiento de tipo exchange entra con category_id nulo", async () => {
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
  it("las cuatro tablas de la app declaran FORCE ROW LEVEL SECURITY", async () => {
    const rows = await db.execute(sql`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('user_settings', 'category', 'movement', 'installment')
      ORDER BY relname
    `)

    expect([...rows]).toEqual([
      { relname: "category", relrowsecurity: true, relforcerowsecurity: true },
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
  it("fuera de withUser, la conexión de la app no ve filas de las tablas de la app", async () => {
    // Hay dos categorías sembradas, una de A y una de B, y ninguna es visible.
    const rows = await db.select().from(category)

    expect(rows).toHaveLength(0)
  })

  // El detector automático del caso de arriba: withUser() se niega a correr si el
  // rol de conexión tiene BYPASSRLS, en vez de andar bien y aislar nada. Acá se
  // verifica el hecho que la verificación consulta; que la verificación existe y
  // deja pasar lo prueba cualquier otro test, porque todos usan withUser().
  it("el rol de conexión de la app no tiene BYPASSRLS", async () => {
    const rows = await db.execute(
      sql`SELECT current_user::text AS rol, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    )
    const [fila] = [...rows] as { rol: string; rolbypassrls: boolean }[]

    expect(fila.rolbypassrls).toBe(false)
  })
})
