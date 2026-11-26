"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { cardStatement, creditCard, installment, movement } from "@/db/schema"
import {
  isValidPeriod,
  resolveStatementPayment,
  statementTotals,
  type StatementPaymentMode,
} from "@/lib/cards"
import { CATEGORY_COLOR_KEYS } from "@/lib/category-color"
import { todayInAr } from "@/lib/dates"
import { isCheckViolation, isUniqueViolation } from "@/lib/db-errors"
import { logDbError } from "@/lib/log-db-error"
import { cardSchema, positiveRate, statementDatesSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

const cardIdSchema = z.uuid("Esa tarjeta no existe.")
const statementIdSchema = z.uuid("Ese resumen no existe.")

const colorSchema = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.enum(CATEGORY_COLOR_KEYS, "Ese color no existe.").optional(),
)

const NOMBRE_REPETIDO = "Ya tenés una tarjeta activa con ese nombre."

function parseCard(formData: FormData) {
  return cardSchema.extend({ color: colorSchema }).safeParse({
    name: formData.get("name"),
    closingDay: formData.get("closingDay"),
    dueDay: formData.get("dueDay"),
    creditLimitCents: formData.get("creditLimit") ?? "",
    color: formData.get("color") ?? "",
  })
}

function revalidateAll() {
  revalidatePath("/", "layout")
}

export async function createCard(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = parseCard(formData)
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  try {
    await withUser(user.id, (tx) =>
      tx.insert(creditCard).values({
        id: randomUUID(),
        userId: user.id,
        name: parsed.data.name,
        closingDay: parsed.data.closingDay,
        dueDay: parsed.data.dueDay,
        creditLimitCents: parsed.data.creditLimitCents ?? null,
        color: parsed.data.color ?? null,
      }),
    )
  } catch (error) {
    logDbError("createCard", error)
    if (isUniqueViolation(error, "credit_card_active_name_unique")) {
      return failure(NOMBRE_REPETIDO, { name: [NOMBRE_REPETIDO] })
    }
    return failure("No pudimos guardar la tarjeta. Probá de nuevo.")
  }

  revalidateAll()
  return success()
}

export async function updateCard(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()
  const id = cardIdSchema.safeParse(formData.get("id"))
  if (!id.success) return failure("Esa tarjeta no existe.")

  const parsed = parseCard(formData)
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá los datos.", flat.fieldErrors)
  }

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(creditCard)
        .set({
          name: parsed.data.name,
          closingDay: parsed.data.closingDay,
          dueDay: parsed.data.dueDay,
          creditLimitCents: parsed.data.creditLimitCents ?? null,
          color: parsed.data.color ?? null,
        })
        .where(and(eq(creditCard.id, id.data), eq(creditCard.userId, user.id)))
        .returning({ id: creditCard.id }),
    )
    if (updated.length === 0) return failure("Esa tarjeta no existe.")
  } catch (error) {
    logDbError("updateCard", error)
    if (isUniqueViolation(error, "credit_card_active_name_unique")) {
      return failure(NOMBRE_REPETIDO, { name: [NOMBRE_REPETIDO] })
    }
    return failure("No pudimos guardar la tarjeta. Probá de nuevo.")
  }

  revalidateAll()
  return success()
}

export async function setCardArchived(id: string, archived: boolean): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = cardIdSchema.safeParse(id)
  if (!parsed.success) return failure("Esa tarjeta no existe.")

  try {
    const updated = await withUser(user.id, (tx) =>
      tx
        .update(creditCard)
        .set({ archived })
        .where(and(eq(creditCard.id, parsed.data), eq(creditCard.userId, user.id)))
        .returning({ id: creditCard.id }),
    )
    if (updated.length === 0) return failure("Esa tarjeta no existe.")
  } catch (error) {
    logDbError("setCardArchived", error)
    if (isUniqueViolation(error, "credit_card_active_name_unique")) {
      return failure("Ya tenés otra tarjeta activa con ese nombre: cambiale el nombre primero.")
    }
    return failure("No pudimos actualizar la tarjeta.")
  }

  revalidateAll()
  return success()
}

const MENSAJE_PAGADO = "El resumen está pagado: desmarcalo para cambiarle las fechas."

export async function updateStatementDates(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()
  const cardId = cardIdSchema.safeParse(formData.get("cardId"))
  const period = String(formData.get("period") ?? "")
  if (!cardId.success || !isValidPeriod(period)) return failure("Ese resumen no existe.")

  const parsed = statementDatesSchema.safeParse({
    closingDate: formData.get("closingDate"),
    dueDate: formData.get("dueDate"),
  })
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error)
    return failure(flat.formErrors[0] ?? "Revisá las fechas.", flat.fieldErrors)
  }
  const { closingDate, dueDate } = parsed.data

  try {
    const result = await withUser(user.id, async (tx) => {
      const [card] = await tx
        .select({ id: creditCard.id })
        .from(creditCard)
        .where(and(eq(creditCard.id, cardId.data), eq(creditCard.userId, user.id)))
      if (!card) return failure("Esa tarjeta no existe.")

      const [existing] = await tx
        .select({ id: cardStatement.id, paidDate: cardStatement.paidDate })
        .from(cardStatement)
        .where(and(eq(cardStatement.cardId, card.id), eq(cardStatement.period, period)))

      if (!existing) {
        await tx.insert(cardStatement).values({
          id: randomUUID(),
          userId: user.id,
          cardId: card.id,
          period,
          closingDate,
          dueDate,
        })
        return success()
      }

      if (existing.paidDate !== null) return failure(MENSAJE_PAGADO)

      await tx
        .update(cardStatement)
        .set({ closingDate, dueDate })
        .where(and(eq(cardStatement.id, existing.id), eq(cardStatement.userId, user.id)))
      await tx
        .update(installment)
        .set({ dueDate })
        .where(and(eq(installment.statementId, existing.id), eq(installment.userId, user.id)))
      return success()
    })
    if (!result.ok) return result
  } catch (error) {
    logDbError("updateStatementDates", error)
    if (isCheckViolation(error, "card_statement_paid_is_frozen")) return failure(MENSAJE_PAGADO)
    return failure("No pudimos guardar las fechas. Probá de nuevo.")
  }

  revalidateAll()
  return success()
}

const paymentSchema = z.object({
  statementId: statementIdSchema,
  paidDate: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().optional()),
  mode: z.enum(["usd", "ars"]).catch("usd"),
})

export async function payStatement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = paymentSchema.safeParse({
    statementId: formData.get("statementId"),
    paidDate: formData.get("paidDate"),
    mode: formData.get("mode"),
  })
  if (!parsed.success) return failure("Ese resumen no existe.")
  const mode: StatementPaymentMode = parsed.data.mode

  let usdRate: number | null = null
  const rawRate = String(formData.get("usdPaidRate") ?? "")
  if (mode === "ars" && rawRate !== "") {
    const rate = positiveRate.safeParse(rawRate)
    if (!rate.success) {
      const message = rate.error.issues[0]?.message ?? "Escribí un tipo de cambio válido."
      return failure(message, { usdPaidRate: [message] })
    }
    usdRate = rate.data
  }

  try {
    const result = await withUser(user.id, async (tx) => {
      const [statement] = await tx
        .select({
          id: cardStatement.id,
          closingDate: cardStatement.closingDate,
          paidDate: cardStatement.paidDate,
        })
        .from(cardStatement)
        .where(
          and(eq(cardStatement.id, parsed.data.statementId), eq(cardStatement.userId, user.id)),
        )
        .for("update")
      if (!statement) return failure("Ese resumen no existe.")
      if (statement.paidDate !== null) return failure("Ese resumen ya está pagado.")

      const cuotas = await tx
        .select({ amountCents: installment.amountCents, currency: movement.currency })
        .from(installment)
        .innerJoin(movement, eq(installment.movementId, movement.id))
        .where(and(eq(installment.statementId, statement.id), eq(installment.userId, user.id)))

      const resolved = resolveStatementPayment({
        closingDate: statement.closingDate,
        totals: statementTotals(cuotas),
        requestedDate: parsed.data.paidDate,
        today: todayInAr(),
        mode,
        usdRate,
      })
      if (!resolved.ok) {
        return failure(resolved.message, resolved.field ? { [resolved.field]: [resolved.message] } : undefined)
      }

      await tx
        .update(cardStatement)
        .set({
          paidDate: resolved.paidDate,
          usdPaidRate: resolved.usdPaidRate === null ? null : String(resolved.usdPaidRate),
        })
        .where(and(eq(cardStatement.id, statement.id), eq(cardStatement.userId, user.id)))
      await tx
        .update(installment)
        .set({ paid: true, paidDate: resolved.paidDate })
        .where(and(eq(installment.statementId, statement.id), eq(installment.userId, user.id)))
      return success()
    })
    if (!result.ok) return result
  } catch (error) {
    logDbError("payStatement", error)
    return failure("No pudimos pagar el resumen. Probá de nuevo.")
  }

  revalidateAll()
  return success()
}

export async function unpayStatement(statementId: string): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = statementIdSchema.safeParse(statementId)
  if (!parsed.success) return failure("Ese resumen no existe.")

  try {
    const result = await withUser(user.id, async (tx) => {
      const updated = await tx
        .update(cardStatement)
        .set({ paidDate: null, usdPaidRate: null })
        .where(and(eq(cardStatement.id, parsed.data), eq(cardStatement.userId, user.id)))
        .returning({ id: cardStatement.id })
      if (updated.length === 0) return failure("Ese resumen no existe.")

      await tx
        .update(installment)
        .set({ paid: false, paidDate: null })
        .where(and(eq(installment.statementId, parsed.data), eq(installment.userId, user.id)))
      return success()
    })
    if (!result.ok) return result
  } catch (error) {
    logDbError("unpayStatement", error)
    return failure("No pudimos desmarcar el resumen.")
  }

  revalidateAll()
  return success()
}
