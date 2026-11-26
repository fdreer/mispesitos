"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { category, userSettings } from "@/db/schema"
import { DEFAULT_CATEGORIES } from "@/lib/default-categories"
import { logDbError } from "@/lib/log-db-error"
import { settingsSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

export async function saveSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = settingsSchema.safeParse({
    initialBalanceArsCents: formData.get("initialBalanceArs") ?? "",
    initialBalanceUsdCents: formData.get("initialBalanceUsd") ?? "",
    initialBalanceUsdRate: formData.get("initialBalanceUsdRate") ?? "",
    initialBalanceDate: formData.get("initialBalanceDate") ?? "",
    preferredRate: formData.get("preferredRate") ?? "",
  })

  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }

  // Drizzle mapea las columnas `numeric` a string, no a number (ver
  // src/db/schema.ts): el TC sale de Zod como number para poder compararlo en
  // la validación cruzada, y hay que devolverlo a string antes de escribirlo.
  const values = {
    ...parsed.data,
    initialBalanceUsdRate: String(parsed.data.initialBalanceUsdRate),
  }

  try {
    await withUser(user.id, async (tx) => {
      const existing = await tx
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .limit(1)

      // `onConflictDoUpdate` en vez de ramificar entre INSERT y UPDATE: entre
      // el SELECT de arriba y esta línea puede colarse otro request del mismo
      // usuario (dos clics en "Listo, empezar"). Con el INSERT pelado, el
      // segundo chocaba contra la PK, la transacción entera volvía atrás y el
      // usuario veía "no pudimos guardar" con los ajustes ya guardados.
      await tx
        .insert(userSettings)
        .values({ userId: user.id, ...values })
        .onConflictDoUpdate({ target: userSettings.userId, set: values })

      if (existing.length > 0) return

      // Primera vez: se precargan las categorías para que nadie arranque con
      // una pantalla en blanco.
      //
      // `onConflictDoNothing` por la misma carrera: si el otro request ya las
      // sembró, el índice único parcial (category_active_unique) las rechaza
      // una por una en vez de tumbar la transacción. NO se llega acá en un
      // guardado desde /ajustes —`existing` corta antes—, así que archivar una
      // categoría y volver a guardar los ajustes no la resucita.
      //
      // Dos pasadas porque las subcategorías necesitan el id de su padre. Las
      // hijas se siembran SÓLO bajo los padres que esta transacción insertó de
      // verdad (`returning` no trae los que rechazó el índice): si el otro
      // request ganó la carrera, los ids de acá no existen y colgarles hijas
      // reventaría la FK de `parent_id` y con ella todo el guardado.
      const parents = await tx
        .insert(category)
        .values(
          DEFAULT_CATEGORIES.map((c) => ({
            id: randomUUID(),
            userId: user.id,
            name: c.name,
            kind: c.kind,
            color: c.color ?? null,
            icon: c.icon ?? null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: category.id, name: category.name, kind: category.kind })

      const children = parents.flatMap((p) => {
        const plantilla = DEFAULT_CATEGORIES.find((c) => c.name === p.name && c.kind === p.kind)
        return (plantilla?.children ?? []).map((child) => ({
          id: randomUUID(),
          userId: user.id,
          name: child.name,
          kind: p.kind,
          parentId: p.id,
          icon: child.icon ?? null,
        }))
      })
      if (children.length > 0) {
        await tx.insert(category).values(children).onConflictDoNothing()
      }
    })
  } catch (error) {
    logDbError("saveSettings", error)
    return failure("No pudimos guardar los ajustes. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}
