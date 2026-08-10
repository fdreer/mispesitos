import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, sql } from "drizzle-orm"

import { db, sqlClient, withUser } from "@/db/client"
import { category, user } from "@/db/schema"

const USER_A = "rls-test-user-a"
const USER_B = "rls-test-user-b"

async function seedUser(id: string) {
  // `user` no lleva FORCE ROW LEVEL SECURITY: better-auth la consulta con el rol
  // de conexión, fuera de withUser, así que ese rol la tiene que poder escribir.
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
  // FORCE. Este test es el único que verifica esa declaración. Si se pone en
  // rojo, el arreglo es volver a poner FORCE en la migración, nunca bajar la
  // expectativa.
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

  // SALTEADO A PROPÓSITO: HOY ESTA GARANTÍA NO EXISTE. No es un test de más ni
  // un test roto — es un agujero conocido, documentado en
  // .superpowers/sdd/task-9-report.md.
  //
  // Éste es el comportamiento que se buscaba con FORCE: que una consulta que se
  // olvide de withUser() devuelva cero filas en vez de devolver datos ajenos.
  // No se cumple porque el rol con el que la app conecta contra Supabase es
  // `postgres`, y ese rol tiene el atributo BYPASSRLS (verificado en pg_roles).
  // BYPASSRLS le gana a FORCE: el rol saltea RLS por completo, sea dueño o no.
  // Corrido sin skip hoy, `db.select().from(category)` devuelve las categorías
  // de TODOS los usuarios.
  //
  // Para que esto pase de verdad, la app tiene que conectar con un rol propio
  // sin BYPASSRLS (decisión de infraestructura: crear el rol en Supabase y
  // cambiar DATABASE_URL, dejando `postgres` sólo para las migraciones).
  // Cuando eso ocurra, sacarle el skip: pasa a ser la prueba real de la segunda
  // capa. Mientras tanto, la única capa que aísla usuarios es withUser().
  it.skip("fuera de withUser, ni el rol dueño ve filas de las tablas de la app", async () => {
    // Hay dos categorías sembradas, una de A y una de B, y ninguna es visible.
    const rows = await db.select().from(category)

    expect(rows).toHaveLength(0)
  })
})
