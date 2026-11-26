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

/**
 * Las acciones de /tarjetas (§1 del plan v2, Fase 3): alta, edición y
 * archivo de tarjetas, corrección de las fechas de un resumen, y pagarlo o
 * desmarcarlo.
 *
 * Todo lo que toca un resumen revalida la app entera: pagar un resumen mueve
 * el saldo del dashboard, el estado de las compras en /egresos y la posición
 * en dólares de /cambios.
 */

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

/**
 * Editar el día de cierre o de vencimiento cambia sólo lo que se PROPONE para
 * los resúmenes que todavía no existen. Los que ya existen tienen sus fechas
 * reales y no se tocan: para eso está corregir cada resumen.
 */
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

/**
 * Se archiva, no se borra (§1.2): tiene compras y resúmenes colgando.
 * Archivada deja de ofrecerse como medio de pago, pero sus compras y
 * resúmenes siguen ahí, y se puede seguir pagando lo que deba.
 */
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

/**
 * Corrige el cierre y el vencimiento de un resumen (§1.2): cuando llega el
 * resumen real, las fechas propuestas se ajustan y las cuotas de ese resumen
 * heredan el nuevo vencimiento, en la misma transacción.
 *
 * Si el resumen todavía no existe —el que está acumulando, sin ninguna compra
 * aún— se crea con las fechas que llegan: así se le puede corregir el cierre
 * antes de que entre la primera compra, que es justo cuando importa.
 *
 * Cambiar el cierre NO reasigna las compras que ya están en el resumen: sólo
 * decide dónde caen las que se carguen desde ahora. Mover compras ya
 * cargadas entre resúmenes sería reescribir planes de cuotas por un cambio
 * de fecha, y eso no lo pide el plan.
 */
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
        .where(eq(cardStatement.id, existing.id))
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

/**
 * Paga un resumen (§1.3): pone la fecha en el resumen y en TODAS sus cuotas,
 * en una sola transacción. Sólo pago total (decisión 7.3).
 *
 * La parte en dólares (decisión 7.1) se paga con dólares —las cuotas USD
 * descuentan del saldo en dólares, como cualquier otra— o con pesos al TC
 * que se informe, que queda guardado en el resumen. Las cuotas no se
 * reescriben: la traducción a pesos ocurre al leer (`perceivedPayment` en
 * @/lib/cards), así que desmarcar vuelve todo atrás.
 *
 * Las reglas de qué fecha y qué TC se aceptan viven en
 * `resolveStatementPayment`, probadas sin base.
 */
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

  // El TC sólo se lee si se va a usar: con dólares, el campo ni se muestra.
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
      if (!statement) return failure("Ese resumen no existe.")
      if (statement.paidDate !== null) return failure("Ese resumen ya está pagado.")

      const cuotas = await tx
        .select({ amountCents: installment.amountCents, currency: movement.currency })
        .from(installment)
        .innerJoin(movement, eq(installment.movementId, movement.id))
        .where(eq(installment.statementId, statement.id))

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
        .where(eq(cardStatement.id, statement.id))
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

/** Desmarca el resumen y, con él, todas sus cuotas (§1.3). */
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
