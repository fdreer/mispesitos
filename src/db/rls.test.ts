import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"

import { db, sqlClient, withUser } from "@/db/client"
import { category, user } from "@/db/schema"

const USER_A = "rls-test-user-a"
const USER_B = "rls-test-user-b"

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

  // `category` sí lleva FORCE: se siembra por withUser(), la misma puerta que
  // usa la app. Un INSERT directo quedaría fuera de toda policy.
  await withUser(id, (tx) =>
    tx
      .insert(category)
      .values({ id: `cat-${id}`, userId: id, name: "Prueba", kind: "expense" })
      .onConflictDoNothing(),
  )
}

beforeAll(async () => {
  await seedUser(USER_A)
  await seedUser(USER_B)
})

afterAll(async () => {
  // El DELETE corre con el rol de conexión sobre `user` y arrastra las
  // categorías por ON DELETE CASCADE: la integridad referencial no pasa por RLS.
  await db.delete(user).where(eq(user.id, USER_A))
  await db.delete(user).where(eq(user.id, USER_B))
  await sqlClient.end()
})

describe("RLS", () => {
  it("un usuario sólo ve sus propias categorías", async () => {
    const rows = await withUser(USER_A, (tx) => tx.select().from(category))

    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(USER_A)
  })

  it("un SELECT sin WHERE no filtra datos de otro usuario", async () => {
    // Éste es el punto de la segunda capa: la consulta NO filtra por user_id
    // y aun así la base no devuelve nada ajeno.
    const rows = await withUser(USER_B, (tx) =>
      tx.execute(sql`SELECT user_id FROM category`),
    )

    const userIds = [...rows].map((r) => (r as { user_id: string }).user_id)
    expect(userIds).toEqual([USER_B])
  })

  it("no se puede insertar una fila a nombre de otro usuario", async () => {
    await expect(
      withUser(USER_A, (tx) =>
        tx
          .insert(category)
          .values({ id: "cat-robada", userId: USER_B, name: "Robada", kind: "expense" }),
      ),
    ).rejects.toThrow()
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
  // Los cuatro tests de arriba consultan desde adentro de withUser(), que hace
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
})
