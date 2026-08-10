"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { installment, movement } from "@/db/schema"
import { todayInAr } from "@/lib/dates"
import { exchangeSchema, movementSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

/**
 * Las cuotas viajan en el FormData como campos repetidos, en el mismo orden:
 * installmentAmount[] e installmentDueDate[]. El emparejamiento es posicional,
 * así que si las dos listas no vienen del mismo largo no hay forma de saber qué
 * importe corresponde a qué vencimiento: se rechaza en vez de adivinar.
 */
function readInstallments(formData: FormData): { amountCents: string; dueDate: string }[] | null {
  const amounts = formData.getAll("installmentAmount").map(String)
  const dates = formData.getAll("installmentDueDate").map(String)
  if (amounts.length !== dates.length) return null
  return amounts.map((amountCents, i) => ({ amountCents, dueDate: dates[i] }))
}

export async function createMovement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const installments = readInstallments(formData)
  if (installments === null) {
    return failure("El plan de cuotas llegó incompleto. Recargá la página y probá de nuevo.")
  }

  const parsed = movementSchema.safeParse({
    kind: formData.get("kind"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    date: formData.get("date"),
    currency: formData.get("currency"),
    amountCents: formData.get("amountCents") ?? "",
    rate: formData.get("rate") ?? "1",
    installments,
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  const input = parsed.data
  const movementId = randomUUID()

  try {
    await withUser(user.id, async (tx) => {
      await tx.insert(movement).values({
        id: movementId,
        userId: user.id,
        kind: input.kind,
        description: input.description,
        categoryId: input.categoryId,
        date: input.date,
        currency: input.currency,
        amountCents: input.amountCents,
        rate: String(input.rate),
        direction: null,
      })

      await tx.insert(installment).values(
        input.installments.map((cuota, index) => ({
          id: randomUUID(),
          movementId,
          userId: user.id,
          number: index + 1,
          amountCents: cuota.amountCents,
          dueDate: cuota.dueDate,
          paid: false,
          paidDate: null,
        })),
      )
    })
  } catch (error) {
    console.error("createMovement", error)
    return failure("No pudimos guardar el movimiento. Probá de nuevo.")
  }

  revalidatePath("/dashboard")
  revalidatePath(input.kind === "income" ? "/ingresos" : "/egresos")
  return success()
}

/**
 * Compra o venta de dólares. Un cambio NO genera cuotas: es instantáneo y
 * mueve las dos monedas de una. `categoryId` va `null` a propósito — la FK de
 * `movement` es compuesta `(user_id, category_id) → category (user_id, id)`
 * con `MATCH SIMPLE`, así que una columna nula de la FK pasa sin problema.
 */
export async function createExchange(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = exchangeSchema.safeParse({
    direction: formData.get("direction"),
    date: formData.get("date"),
    usdCents: formData.get("usdCents") ?? "",
    rate: formData.get("rate") ?? "",
  })

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  const input = parsed.data

  try {
    await withUser(user.id, (tx) =>
      tx.insert(movement).values({
        id: randomUUID(),
        userId: user.id,
        kind: "exchange",
        description: input.direction === "buy" ? "Compra de dólares" : "Venta de dólares",
        categoryId: null,
        date: input.date,
        currency: "USD",
        amountCents: input.usdCents,
        rate: String(input.rate),
        direction: input.direction,
      }),
    )
  } catch (error) {
    console.error("createExchange", error)
    return failure("No pudimos registrar la operación.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * Los ids de movimiento los genera `randomUUID()`: validar que lo que llega
 * es un UUID es el borde de confianza mínimo para una Server Action, incluso
 * cuando el único otro filtro (userId) ya lo cierra la RLS de la base.
 */
const deleteMovementIdSchema = z.uuid("Ese movimiento no existe.")

export async function deleteMovement(id: string): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = deleteMovementIdSchema.safeParse(id)
  if (!parsed.success) {
    return failure("Ese movimiento no existe.")
  }

  try {
    // Las cuotas caen solas por el ON DELETE CASCADE.
    await withUser(user.id, (tx) =>
      tx
        .delete(movement)
        .where(and(eq(movement.id, parsed.data), eq(movement.userId, user.id))),
    )
  } catch (error) {
    console.error("deleteMovement", error)
    return failure("No pudimos borrar el movimiento.")
  }

  revalidatePath("/", "layout")
  return success()
}

/**
 * Los ids de cuota los genera `randomUUID()`, igual que los de movimiento:
 * mismo criterio que `deleteMovementIdSchema` — validar que sea un UUID es
 * el borde de confianza mínimo, incluso cuando la RLS ya filtra por userId.
 */
const setInstallmentPaidSchema = z.object({
  id: z.uuid("Esa cuota no existe."),
  paid: z.boolean(),
})

export async function setInstallmentPaid(id: string, paid: boolean): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = setInstallmentPaidSchema.safeParse({ id, paid })
  if (!parsed.success) {
    return failure("Esa cuota no existe.")
  }

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(installment)
        .set({ paid: parsed.data.paid, paidDate: parsed.data.paid ? todayInAr() : null })
        .where(and(eq(installment.id, parsed.data.id), eq(installment.userId, user.id)))
        .returning({ id: installment.id }),
    )

    if (updated.length === 0) return failure("No encontramos esa cuota.")
  } catch (error) {
    console.error("setInstallmentPaid", error)
    return failure("No pudimos actualizar la cuota.")
  }

  revalidatePath("/", "layout")
  return success()
}
