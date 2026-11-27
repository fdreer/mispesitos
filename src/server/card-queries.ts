import "server-only"

import { cache } from "react"

import { aliasedTable, and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { withUser, type Tx } from "@/db/client"
import { cardStatement, category, creditCard, installment, movement } from "@/db/schema"
import { addPeriods, type KnownStatement, type StatementSummary } from "@/lib/cards"
import { monthKey, type IsoDate } from "@/lib/dates"

export type CreditCard = typeof creditCard.$inferSelect

export function selectCards(
  tx: Tx,
  userId: string,
  includeArchived = false,
): Promise<CreditCard[]> {
  const conditions = [eq(creditCard.userId, userId)]
  if (!includeArchived) conditions.push(eq(creditCard.archived, false))
  return tx
    .select()
    .from(creditCard)
    .where(and(...conditions))
    .orderBy(asc(creditCard.name))
}

export const listCards = cache(async function listCards(
  userId: string,
  includeArchived = false,
): Promise<CreditCard[]> {
  return withUser(userId, (tx) => selectCards(tx, userId, includeArchived))
})

export async function selectCard(
  tx: Tx,
  userId: string,
  cardId: string,
): Promise<CreditCard | null> {
  const rows = await tx
    .select()
    .from(creditCard)
    .where(and(eq(creditCard.userId, userId), eq(creditCard.id, cardId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getCard(userId: string, cardId: string): Promise<CreditCard | null> {
  return withUser(userId, (tx) => selectCard(tx, userId, cardId))
}

export type StatementRow = StatementSummary & {
  id: string
  cardId: string
  usdPaidArsCents: number | null
}

export type StatementFilters = {
  cardId?: string
  /** Sólo los resúmenes impagos: el dashboard no necesita la historia. */
  onlyUnpaid?: boolean
}

export async function selectStatementSummaries(
  tx: Tx,
  userId: string,
  { cardId, onlyUnpaid = false }: StatementFilters = {},
): Promise<StatementRow[]> {
  const conditions = [eq(cardStatement.userId, userId)]
  if (cardId) conditions.push(eq(cardStatement.cardId, cardId))
  if (onlyUnpaid) conditions.push(isNull(cardStatement.paidDate))
  const rows = await tx
    .select({
      id: cardStatement.id,
      cardId: cardStatement.cardId,
      period: cardStatement.period,
      closingDate: cardStatement.closingDate,
      dueDate: cardStatement.dueDate,
      paidDate: cardStatement.paidDate,
      usdPaidArsCents: cardStatement.usdPaidArsCents,
      arsCents: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'ARS'), 0)`,
      usdCents: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'USD'), 0)`,
      count: count(installment.id),
    })
    .from(cardStatement)
    .leftJoin(installment, eq(installment.statementId, cardStatement.id))
    .leftJoin(movement, eq(installment.movementId, movement.id))
    .where(and(...conditions))
    .groupBy(cardStatement.id)
    .orderBy(asc(cardStatement.period))

  // `sum` de un bigint es `numeric` en Postgres, y llega como texto.
  return rows.map(({ arsCents, usdCents, count: n, ...s }) => ({
    ...s,
    totals: { arsCents: Number(arsCents), usdCents: Number(usdCents), count: n },
  }))
}

export async function listStatementSummaries(
  userId: string,
  filters: StatementFilters = {},
): Promise<StatementRow[]> {
  return withUser(userId, (tx) => selectStatementSummaries(tx, userId, filters))
}

/**
 * Las cuotas impagas de compras con tarjeta, para el disponible de cada una
 * (`availableCredit` en @/lib/cards). Con `cardId`, sólo las de esa tarjeta.
 */
export function selectUnpaidCardInstallments(tx: Tx, userId: string, cardId?: string) {
  return tx
    .select({
      cardId: movement.creditCardId,
      amountCents: installment.amountCents,
      currency: movement.currency,
    })
    .from(installment)
    .innerJoin(movement, eq(installment.movementId, movement.id))
    .where(
      and(
        eq(installment.userId, userId),
        eq(installment.paid, false),
        cardId ? eq(movement.creditCardId, cardId) : isNotNull(movement.creditCardId),
      ),
    )
}

export async function listUnpaidCardInstallments(userId: string, cardId?: string) {
  return withUser(userId, (tx) => selectUnpaidCardInstallments(tx, userId, cardId))
}

/**
 * Las cuotas que componen un resumen (§1.4: "Heladera · cuota 3/12"), con lo
 * que hace falta para nombrarlas. `total` es la cantidad de cuotas del
 * movimiento entero, no las de este resumen: se cuenta una vez por compra del
 * resumen, no con una subconsulta por cada fila.
 */
export function selectStatementInstallments(tx: Tx, userId: string, statementId: string) {
  const i2 = aliasedTable(installment, "i2")
  const totals = tx.$with("installment_totals").as(
    tx
      .select({
        // Nombres propios: drizzle referencia las columnas del CTE sin
        // calificar, y `movement_id` chocaría con la de `installment`.
        movementId: sql<string>`${i2.movementId}`.as("totals_movement_id"),
        total: sql<number>`count(*)::int`.as("installment_total"),
      })
      .from(i2)
      .where(
        and(
          eq(i2.userId, userId),
          inArray(
            i2.movementId,
            tx
              .select({ id: installment.movementId })
              .from(installment)
              .where(and(eq(installment.userId, userId), eq(installment.statementId, statementId))),
          ),
        ),
      )
      .groupBy(i2.movementId),
  )

  return tx
    .with(totals)
    .select({
      id: installment.id,
      number: installment.number,
      amountCents: installment.amountCents,
      movementId: movement.id,
      description: movement.description,
      date: movement.date,
      currency: movement.currency,
      categoryId: movement.categoryId,
      total: sql<number>`coalesce(${totals.total}, 1)`,
    })
    .from(installment)
    .innerJoin(movement, eq(installment.movementId, movement.id))
    .leftJoin(totals, eq(totals.movementId, installment.movementId))
    .where(and(eq(installment.userId, userId), eq(installment.statementId, statementId)))
    .orderBy(asc(movement.date), asc(movement.description))
}

export async function listStatementInstallments(userId: string, statementId: string) {
  return withUser(userId, (tx) => selectStatementInstallments(tx, userId, statementId))
}

/**
 * Una tarjeta como la necesita el formulario de carga: su ciclo, para
 * proponer los resúmenes que todavía no existen, y los que sí existen, con
 * sus fechas reales. Con eso el formulario muestra los vencimientos que va a
 * guardar la acción, que hace la misma cuenta (`assignStatements`).
 */
export type CardOption = {
  id: string
  name: string
  closingDay: number
  dueDay: number
  color: string | null
  archived: boolean
  statements: KnownStatement[]
}

/**
 * Las tarjetas para el selector de medio de pago, archivadas incluidas: una
 * compra vieja puede ser de una tarjeta ya archivada y el formulario de
 * edición tiene que poder mostrarla (el selector sólo ofrece las activas).
 *
 * Los resúmenes, desde un año antes de hoy: una compra cargada con atraso
 * cae en un resumen viejo, y el formulario tiene que poder decir cuál —y que
 * ya está pagado— antes de guardar. Más atrás la acción igual decide bien,
 * porque vuelve a mirar la base.
 */
export const listCardOptions = cache(async function listCardOptions(
  userId: string,
  today: IsoDate,
): Promise<CardOption[]> {
  const desde = addPeriods(monthKey(today), -13)
  const [cards, statements] = await withUser(userId, async (tx) => {
    const tarjetas = await tx
      .select()
      .from(creditCard)
      .where(eq(creditCard.userId, userId))
      .orderBy(asc(creditCard.name))
    const resumenes = await tx
      .select({
        id: cardStatement.id,
        cardId: cardStatement.cardId,
        period: cardStatement.period,
        closingDate: cardStatement.closingDate,
        dueDate: cardStatement.dueDate,
        paidDate: cardStatement.paidDate,
      })
      .from(cardStatement)
      .where(and(eq(cardStatement.userId, userId), gte(cardStatement.period, desde)))
    return [tarjetas, resumenes] as const
  })

  return cards.map((c) => ({
    id: c.id,
    name: c.name,
    closingDay: c.closingDay,
    dueDay: c.dueDay,
    color: c.color,
    archived: c.archived,
    statements: statements
      .filter((s) => s.cardId === c.id)
      .map((s) => ({
        id: s.id,
        period: s.period,
        closingDate: s.closingDate,
        dueDate: s.dueDate,
        paid: s.paidDate !== null,
      })),
  }))
})

export type DescriptionSuggestion = { description: string; categoryId: string | null }

async function queryDescriptionSuggestions(
  tx: Tx,
  userId: string,
  kind: "income" | "expense",
): Promise<DescriptionSuggestion[]> {
  const distinct = tx
    .selectDistinctOn([sql`lower(${movement.description})`], {
      description: movement.description,
      categoryId: movement.categoryId,
      date: movement.date,
    })
    .from(movement)
    .where(and(eq(movement.userId, userId), eq(movement.kind, kind)))
    .orderBy(sql`lower(${movement.description})`, desc(movement.date), desc(movement.createdAt))
    .as("distinct_descriptions")

  const rows = await tx
    .select({
      description: distinct.description,
      categoryId: distinct.categoryId,
    })
    .from(distinct)
    .orderBy(desc(distinct.date), asc(distinct.description))
    .limit(300)

  return rows
}

/**
 * Descripciones ya usadas, con la categoría de la última vez (§5.2 del plan
 * v2: autocompletar y sugerir la categoría). Una por descripción —sin
 * distinguir mayúsculas—, la más reciente, y como mucho 300: es para un
 * `<datalist>`, no un historial.
 */
export const listDescriptionSuggestions = cache(async function listDescriptionSuggestions(
  userId: string,
  kind: "income" | "expense",
): Promise<DescriptionSuggestion[]> {
  return withUser(userId, (tx) => queryDescriptionSuggestions(tx, userId, kind))
})

/**
 * Trae todos los catálogos que necesita `MobileQuickAddLoader` en UNA sola
 * transacción `withUser` en vez de cinco conexiones concurrentes del pool.
 */
export const getQuickAddCatalogs = cache(async function getQuickAddCatalogs(
  userId: string,
  today: IsoDate,
) {
  const desde = addPeriods(monthKey(today), -13)
  return withUser(userId, async (tx) => {
    const categories = await tx
      .select()
      .from(category)
      .where(eq(category.userId, userId))
      .orderBy(asc(category.name))

    const tarjetas = await tx
      .select()
      .from(creditCard)
      .where(eq(creditCard.userId, userId))
      .orderBy(asc(creditCard.name))

    const resumenes = await tx
      .select({
        id: cardStatement.id,
        cardId: cardStatement.cardId,
        period: cardStatement.period,
        closingDate: cardStatement.closingDate,
        dueDate: cardStatement.dueDate,
        paidDate: cardStatement.paidDate,
      })
      .from(cardStatement)
      .where(and(eq(cardStatement.userId, userId), gte(cardStatement.period, desde)))

    const expenseSuggestions = await queryDescriptionSuggestions(tx, userId, "expense")
    const incomeSuggestions = await queryDescriptionSuggestions(tx, userId, "income")

    const cards: CardOption[] = tarjetas.map((c) => ({
      id: c.id,
      name: c.name,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
      color: c.color,
      archived: c.archived,
      statements: resumenes
        .filter((s) => s.cardId === c.id)
        .map((s) => ({
          id: s.id,
          period: s.period,
          closingDate: s.closingDate,
          dueDate: s.dueDate,
          paid: s.paidDate !== null,
        })),
    }))

    return {
      expenseCategories: categories.filter((c) => c.kind === "expense"),
      incomeCategories: categories.filter((c) => c.kind === "income"),
      cards,
      expenseSuggestions,
      incomeSuggestions,
    }
  })
})
