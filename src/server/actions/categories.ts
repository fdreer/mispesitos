"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { category } from "@/db/schema"
import { isUniqueViolation } from "@/lib/db-errors"
import { logDbError } from "@/lib/log-db-error"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

const schema = z.object({
  name: z.string().trim().min(1, "Poné un nombre.").max(60),
  kind: z.enum(["income", "expense"]),
})

export async function createCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = schema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
  })
  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }

  try {
    await withUser(user.id, (tx) =>
      tx.insert(category).values({ id: randomUUID(), userId: user.id, ...parsed.data }),
    )
  } catch (error) {
    // El índice único parcial (category_active_unique) sólo mira las
    // categorías activas y Postgres lo rechaza con 23505. Cualquier otro
    // error —conexión caída, RLS, timeout— tiene que quedar con un mensaje
    // genérico: decirle "nombre repetido" al usuario cuando no lo es no le
    // deja forma de entender qué pasa.
    if (isUniqueViolation(error, "category_active_unique")) {
      logDbError("createCategory: nombre repetido", error)
      return failure("Ya tenés una categoría con ese nombre.")
    }
    logDbError("createCategory", error)
    return failure("No pudimos crear la categoría. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * Los ids de categoría los genera `randomUUID()`, igual que los de movimiento
 * y cuota: mismo criterio que `deleteMovementIdSchema`/`setInstallmentPaidSchema`
 * en @/server/actions/movements — validar que sea un UUID es el borde de
 * confianza mínimo, incluso cuando la RLS ya filtra por userId.
 */
const archiveCategoryIdSchema = z.uuid("Esa categoría no existe.")

/**
 * Se archiva en lugar de borrar: los movimientos históricos conservan su
 * categoría.
 */
export async function archiveCategory(id: string): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = archiveCategoryIdSchema.safeParse(id)
  if (!parsed.success) {
    return failure("Esa categoría no existe.")
  }

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(category)
        .set({ archived: true })
        .where(and(eq(category.id, parsed.data), eq(category.userId, user.id)))
        .returning({ id: category.id }),
    )

    if (updated.length === 0) return failure("No encontramos esa categoría.")
  } catch (error) {
    logDbError("archiveCategory", error)
    return failure("No pudimos archivar la categoría.")
  }

  revalidatePath("/", "layout")
  return success()
}
