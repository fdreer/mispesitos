import "server-only"

import { randomUUID } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"

import type { Tx } from "@/db/client"
import { cardStatement, creditCard } from "@/db/schema"
import { assignStatements, formatPeriod, paidStatementConflict } from "@/lib/cards"
import type { IsoDate } from "@/lib/dates"
import { failure, type ActionResult } from "@/server/actions/result"

export type PreviousInstallment = {
  number: number
  amountCents: number
  paid: boolean
  paidDate: string | null
  statementId: string | null
}

export type CardInstallmentRow = {
  amountCents: number
  dueDate: IsoDate
  statementId: string
  paid: boolean
  paidDate: string | null
}

export type CardPlan = { ok: true; rows: CardInstallmentRow[] } | { ok: false; result: ActionResult }

const fail = (message: string, field?: string): CardPlan => ({
  ok: false,
  result: failure(message, field ? { [field]: [message] } : undefined),
})

export async function planCardInstallments(
  tx: Tx,
  userId: string,
  input: {
    cardId: string
    purchaseDate: IsoDate
    amounts: number[]
    previous: PreviousInstallment[]
    previousCardId: string | null
    previousPurchaseDate: IsoDate | null
  },
): Promise<CardPlan> {
  const [card] = await tx
    .select()
    .from(creditCard)
    .where(and(eq(creditCard.id, input.cardId), eq(creditCard.userId, userId)))
  if (!card) return fail("Esa tarjeta no existe.", "creditCardId")
  if (card.archived && card.id !== input.previousCardId) {
    return fail("Esa tarjeta está archivada.", "creditCardId")
  }

  if (input.previous.some((p) => p.paid && p.statementId === null)) {
    return fail("Tiene cuotas pagadas: desmarcalas antes de pasar la compra a tarjeta.")
  }

  const known = await tx
    .select({
      id: cardStatement.id,
      period: cardStatement.period,
      closingDate: cardStatement.closingDate,
      dueDate: cardStatement.dueDate,
      paidDate: cardStatement.paidDate,
    })
    .from(cardStatement)
    .where(and(eq(cardStatement.cardId, card.id), eq(cardStatement.userId, userId)))

  const sameCardAndDate =
    card.id === input.previousCardId && input.purchaseDate === input.previousPurchaseDate
  const previousFirst = input.previous.find((p) => p.number === 1)?.statementId ?? null
  const anchor = sameCardAndDate
    ? (known.find((s) => s.id === previousFirst)?.period ?? null)
    : null
  const plan = assignStatements(card, input.purchaseDate, input.amounts.length, known, anchor)
  const byPeriod = new Map(known.map((s) => [s.period, s]))

  const paidIds = new Set([
    ...known.filter((s) => s.paidDate !== null).map((s) => s.id),
    ...input.previous.filter((p) => p.paid && p.statementId).map((p) => p.statementId!),
  ])
  const conflict = paidStatementConflict(
    input.amounts.map((amountCents, i) => ({
      number: i + 1,
      statementId: byPeriod.get(plan[i].period)?.id ?? null,
      amountCents,
    })),
    input.previous,
    paidIds,
  )
  if (conflict !== null) {
    const period = plan[conflict - 1]?.period
    const which = period ? `el resumen de ${formatPeriod(period)}` : "un resumen"
    return fail(
      `La cuota ${conflict} cae en ${which} de ${card.name}, que ya está pagado. ` +
        "Desmarcalo para cambiar sus compras.",
    )
  }

  const missing = [...new Set(plan.map((s) => s.period))].filter((p) => !byPeriod.has(p))
  if (missing.length > 0) {
    await tx
      .insert(cardStatement)
      .values(
        // Los períodos del plan son meses consecutivos: no se repiten.
        plan
          .filter((s) => missing.includes(s.period))
          .map((s) => ({
            id: randomUUID(),
            userId,
            cardId: card.id,
            period: s.period,
            closingDate: s.closingDate,
            dueDate: s.dueDate,
          })),
      )
      // Otra pestaña pudo crear el mismo resumen recién: gana el suyo, que se
      // relee abajo con sus fechas.
      .onConflictDoNothing({ target: [cardStatement.cardId, cardStatement.period] })

    const created = await tx
      .select({
        id: cardStatement.id,
        period: cardStatement.period,
        closingDate: cardStatement.closingDate,
        dueDate: cardStatement.dueDate,
        paidDate: cardStatement.paidDate,
      })
      .from(cardStatement)
      .where(
        and(
          eq(cardStatement.cardId, card.id),
          eq(cardStatement.userId, userId),
          inArray(cardStatement.period, missing),
        ),
      )
    for (const s of created) byPeriod.set(s.period, s)

    // Carrera: otra pestaña creó y pagó alguno de los resúmenes faltantes entre
    // el SELECT inicial y el INSERT ... ON CONFLICT DO NOTHING. No podemos meter
    // cuotas nuevas en un resumen que ya quedó pagado.
    const newlyPaidIdx = plan.findIndex((p) => {
      const s = byPeriod.get(p.period)
      return s !== undefined && s.paidDate !== null && !paidIds.has(s.id)
    })
    if (newlyPaidIdx !== -1) {
      const period = plan[newlyPaidIdx].period
      return fail(
        `La cuota ${newlyPaidIdx + 1} cae en el resumen de ${formatPeriod(period)} de ${card.name}, ` +
          "que ya está pagado. Desmarcalo para cambiar sus compras.",
      )
    }
  }

  return {
    ok: true,
    rows: input.amounts.map((amountCents, i) => {
      const statement = byPeriod.get(plan[i].period)!
      return {
        amountCents,
        dueDate: statement.dueDate,
        statementId: statement.id,
        paid: statement.paidDate !== null,
        paidDate: statement.paidDate,
      }
    }),
  }
}
