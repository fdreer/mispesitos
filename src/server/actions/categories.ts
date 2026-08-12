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
const categoryIdSchema = z.uuid("Esa categoría no existe.")

/**
 * El UPDATE que comparten archivar y desarchivar: es la misma fila, la misma
 * columna y los mismos dos filtros, y sólo cambia el booleano. Devuelve
 * `false` cuando no tocó ninguna fila (id de otro usuario, o inexistente) para
 * que cada llamador ponga su propio mensaje.
 */
async function setArchived(userId: string, id: string, archived: boolean): Promise<boolean> {
  const updated = await withUser(userId, (tx) =>
    tx
      .update(category)
      .set({ archived })
      .where(and(eq(category.id, id), eq(category.userId, userId)))
      .returning({ id: category.id }),
  )
  return updated.length > 0
}

/**
 * Se archiva en lugar de borrar: los movimientos históricos conservan su
 * categoría.
 */
export async function archiveCategory(id: string): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = categoryIdSchema.safeParse(id)
  if (!parsed.success) {
    return failure("Esa categoría no existe.")
  }

  try {
    if (!(await setArchived(user.id, parsed.data, true))) {
      return failure("No encontramos esa categoría.")
    }
  } catch (error) {
    logDbError("archiveCategory", error)
    return failure("No pudimos archivar la categoría.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * El camino de vuelta. Puede fallar donde archivar nunca falla: el índice
 * único `category_active_unique` es PARCIAL —sólo mira las activas, que es lo
 * que permite archivar "Ocio" y volver a crearla— así que mientras ésta
 * estuvo archivada se pudo crear otra activa con el mismo nombre y tipo.
 * Desarchivarla ahora las dejaría a las dos activas y Postgres lo rechaza con
 * 23505.
 *
 * Se distingue ese caso del resto por el mismo motivo que en `createCategory`:
 * "ya tenés una con ese nombre" le dice a la persona qué hacer (renombrar una
 * de las dos), y el genérico no. Qué pasa con la duplicada es una decisión de
 * ella, no de la app: acá no se renombra ni se archiva nada por su cuenta.
 */
export async function unarchiveCategory(id: string): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = categoryIdSchema.safeParse(id)
  if (!parsed.success) {
    return failure("Esa categoría no existe.")
  }

  try {
    if (!(await setArchived(user.id, parsed.data, false))) {
      return failure("No encontramos esa categoría.")
    }
  } catch (error) {
    if (isUniqueViolation(error, "category_active_unique")) {
      logDbError("unarchiveCategory: nombre repetido", error)
      return failure("Ya tenés una categoría activa con ese nombre.")
    }
    logDbError("unarchiveCategory", error)
    return failure("No pudimos desarchivar la categoría.")
  }

  revalidatePath("/", "layout")
  return success()
}
