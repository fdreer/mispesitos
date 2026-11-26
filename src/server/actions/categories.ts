"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, isNull, or } from "drizzle-orm"
import { z } from "zod"

import { withUser, type Tx } from "@/db/client"
import { category, movement } from "@/db/schema"
import { CATEGORY_COLOR_KEYS } from "@/lib/category-color"
import { CATEGORY_ICON_KEYS } from "@/lib/category-icons"
import { isCheckViolation, isUniqueViolation } from "@/lib/db-errors"
import { logDbError } from "@/lib/log-db-error"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

const categoryIdSchema = z.uuid("Esa categoría no existe.")

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional())

const appearanceSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre.").max(60),
  color: optional(z.enum(CATEGORY_COLOR_KEYS, "Ese color no existe.")),
  icon: optional(z.enum(CATEGORY_ICON_KEYS, "Ese icono no existe.")),
})

const movementsToSchema = z.enum(["general", "child"]).catch("general")

const createSchema = appearanceSchema.extend({
  kind: z.enum(["income", "expense"]),
  parentId: optional(categoryIdSchema),
  movementsTo: movementsToSchema,
})

const MENSAJE_TERCER_NIVEL = "Una subcategoría no puede tener subcategorías."
const MENSAJE_PADRE_CON_MOVIMIENTOS =
  "La categoría todavía tiene movimientos. Recargá la página y probá de nuevo."

function knownDbError(error: unknown): { message: string; label: string } | null {
  if (isUniqueViolation(error, "category_active_unique")) {
    return { message: "Ya tenés una categoría con ese nombre.", label: "nombre repetido" }
  }
  if (isCheckViolation(error, "category_two_levels")) {
    return { message: MENSAJE_TERCER_NIVEL, label: "tercer nivel" }
  }
  if (isCheckViolation(error, "movement_category_is_leaf")) {
    return { message: MENSAJE_PADRE_CON_MOVIMIENTOS, label: "padre con movimientos" }
  }
  return null
}

type ParentCheck = { ok: true; hadChildren: boolean } | { ok: false; message: string }

async function checkParent(
  tx: Tx,
  userId: string,
  parentId: string,
  kind: string,
): Promise<ParentCheck> {
  const [parent] = await tx
    .select({ kind: category.kind, parentId: category.parentId, archived: category.archived })
    .from(category)
    .where(and(eq(category.id, parentId), eq(category.userId, userId)))
  if (!parent || parent.kind !== kind || parent.archived) {
    return { ok: false, message: "No encontramos esa categoría padre." }
  }
  if (parent.parentId !== null) return { ok: false, message: MENSAJE_TERCER_NIVEL }

  const [child] = await tx
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.parentId, parentId), eq(category.userId, userId)))
    .limit(1)
  return { ok: true, hadChildren: child !== undefined }
}

async function reassignParentMovements(
  tx: Tx,
  userId: string,
  parent: { id: string; kind: string },
  childId: string,
  childName: string,
  movementsTo: "general" | "child",
): Promise<void> {
  const [any] = await tx
    .select({ id: movement.id })
    .from(movement)
    .where(and(eq(movement.userId, userId), eq(movement.categoryId, parent.id)))
    .limit(1)
  if (!any) return

  let targetId = childId
  if (movementsTo === "general" && childName !== "General") {
    targetId = randomUUID()
    await tx.insert(category).values({
      id: targetId,
      userId,
      name: "General",
      kind: parent.kind,
      parentId: parent.id,
    })
  }

  await tx
    .update(movement)
    .set({ categoryId: targetId, updatedAt: new Date() })
    .where(and(eq(movement.userId, userId), eq(movement.categoryId, parent.id)))
}

export async function createCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color"),
    icon: formData.get("icon"),
    parentId: formData.get("parentId"),
    movementsTo: formData.get("movementsTo"),
  })
  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }
  const { name, kind, color, icon, parentId, movementsTo } = parsed.data

  try {
    const result = await withUser(user.id, async (tx) => {
      let parentHadChildren = true
      if (parentId) {
        const check = await checkParent(tx, user.id, parentId, kind)
        if (!check.ok) return failure(check.message)
        parentHadChildren = check.hadChildren
      }

      const id = randomUUID()
      await tx.insert(category).values({
        id,
        userId: user.id,
        name,
        kind,
        parentId: parentId ?? null,
        color: color ?? null,
        icon: icon ?? null,
      })

      if (parentId && !parentHadChildren) {
        await reassignParentMovements(tx, user.id, { id: parentId, kind }, id, name, movementsTo)
      }
      return success()
    })
    if (!result.ok) return result
  } catch (error) {
    const known = knownDbError(error)
    logDbError(known ? `createCategory: ${known.label}` : "createCategory", error)
    return failure(known?.message ?? "No pudimos crear la categoría. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}

const updateSchema = appearanceSchema.extend({ id: categoryIdSchema })

/** Cambiar nombre, color o icono. No toca el lugar en el árbol: eso es `moveCategory`. */
export async function updateCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    color: formData.get("color"),
    icon: formData.get("icon"),
  })
  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }
  const { id, name, color, icon } = parsed.data

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(category)
        .set({ name, color: color ?? null, icon: icon ?? null })
        .where(and(eq(category.id, id), eq(category.userId, user.id)))
        .returning({ id: category.id }),
    )
    if (updated.length === 0) return failure("No encontramos esa categoría.")
  } catch (error) {
    const known = knownDbError(error)
    logDbError(known ? `updateCategory: ${known.label}` : "updateCategory", error)
    return failure(known?.message ?? "No pudimos guardar la categoría. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}

const moveSchema = z.object({
  id: categoryIdSchema,
  // Vacío = pasa a primer nivel.
  parentId: optional(categoryIdSchema),
  movementsTo: movementsToSchema,
})

/**
 * "Mover a…" de /categorias, que es también el "Agrupar" del plan (§2.2): las
 * categorías que ya existían quedan de primer nivel, y se agrupan moviéndolas
 * de a una abajo de un padre. Los movimientos no se tocan: siguen apuntando a
 * la misma categoría, que ahora tiene padre.
 *
 * Salvo un caso: si el padre de destino no tenía hijas y sí movimientos,
 * esos movimientos pasan a una subcategoría, igual que al crear la primera
 * (ver `reassignParentMovements`).
 */
export async function moveCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = moveSchema.safeParse({
    id: formData.get("id"),
    parentId: formData.get("parentId"),
    movementsTo: formData.get("movementsTo"),
  })
  if (!parsed.success) return failure("Revisá los datos.")
  const { id, parentId, movementsTo } = parsed.data
  if (parentId === id) return failure("Una categoría no puede ir adentro de sí misma.")

  try {
    const result = await withUser(user.id, async (tx) => {
      const [current] = await tx
        .select({
          kind: category.kind,
          name: category.name,
          parentId: category.parentId,
          archived: category.archived,
        })
        .from(category)
        .where(and(eq(category.id, id), eq(category.userId, user.id)))
      if (!current) return failure("No encontramos esa categoría.")
      if (current.archived) return failure("Desarchivá la categoría antes de moverla.")
      if ((current.parentId ?? undefined) === parentId) return success()

      if (parentId) {
        const [child] = await tx
          .select({ id: category.id })
          .from(category)
          .where(and(eq(category.parentId, id), eq(category.userId, user.id)))
          .limit(1)
        if (child) {
          return failure(
            "Tiene subcategorías: no puede ir adentro de otra. Mové primero sus subcategorías.",
          )
        }

        const check = await checkParent(tx, user.id, parentId, current.kind)
        if (!check.ok) return failure(check.message)

        await tx
          .update(category)
          .set({ parentId })
          .where(and(eq(category.id, id), eq(category.userId, user.id)))
        if (!check.hadChildren) {
          await reassignParentMovements(
            tx,
            user.id,
            { id: parentId, kind: current.kind },
            id,
            current.name,
            movementsTo,
          )
        }
      } else {
        await tx
          .update(category)
          .set({ parentId: null })
          .where(and(eq(category.id, id), eq(category.userId, user.id)))
      }
      return success()
    })
    if (!result.ok) return result
  } catch (error) {
    const known = knownDbError(error)
    logDbError(known ? `moveCategory: ${known.label}` : "moveCategory", error)
    return failure(known?.message ?? "No pudimos mover la categoría. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * Se archiva en lugar de borrar: los movimientos históricos conservan su
 * categoría.
 *
 * Archivar un padre archiva sus hijas (§2.1 del plan): un padre archivado con
 * hijas activas seguiría ofreciendo opciones al cargar un movimiento bajo un
 * encabezado que ya no existe.
 */
export async function archiveCategory(id: string): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = categoryIdSchema.safeParse(id)
  if (!parsed.success) {
    return failure("Esa categoría no existe.")
  }

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(category)
        .set({ archived: true })
        .where(
          and(
            eq(category.userId, user.id),
            or(eq(category.id, parsed.data), eq(category.parentId, parsed.data)),
          ),
        )
        .returning({ id: category.id }),
    )
    if (updated.length === 0) {
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
 * El camino de vuelta. Desarchivar una hija desarchiva su padre (§2.1): una
 * hija activa abajo de un padre archivado no se vería en el selector, que la
 * agrupa por padre. Las hermanas, en cambio, quedan como estaban: se
 * archivaron juntas, pero quizás alguna se quiere dejar archivada.
 *
 * Puede fallar donde archivar nunca falla: el índice único
 * `category_active_unique` es PARCIAL —sólo mira las activas, que es lo que
 * permite archivar "Ocio" y volver a crearla— así que mientras ésta estuvo
 * archivada se pudo crear otra activa con el mismo nombre en el mismo lugar.
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
    const found = await withUser(user.id, async (tx) => {
      const [updated] = await tx
        .update(category)
        .set({ archived: false })
        .where(and(eq(category.id, parsed.data), eq(category.userId, user.id)))
        .returning({ parentId: category.parentId })
      if (!updated) return false
      if (updated.parentId !== null) {
        await tx
          .update(category)
          .set({ archived: false })
          .where(
            and(
              eq(category.id, updated.parentId),
              eq(category.userId, user.id),
              eq(category.archived, true),
              isNull(category.parentId),
            ),
          )
      }
      return true
    })
    if (!found) {
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
