import "server-only"

import { cache } from "react"

import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { withUser, type Tx } from "@/db/client"
import {
  cardStatement,
  category,
  creditCard,
  installment,
  movement,
  userSettings,
} from "@/db/schema"
import { perceivedPayments } from "@/lib/cards"
import type { IsoDate } from "@/lib/dates"
import { parseAmountToCents } from "@/lib/money"
import { assertPaidDate } from "@/lib/movement-asserts"
import {
  type FilterTotals,
  type StatusCounts,
} from "@/lib/movement-list-view"
import {
  CARD_FILTER_CASH,
  movementFiltersFromQuery,
  PAGE_SIZE,
  type MovementQuery,
  type Page,
} from "@/lib/movement-query"

export type Settings = typeof userSettings.$inferSelect

export const getSettings = cache(async (userId: string): Promise<Settings | null> => {
  const rows = await withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  )
  return rows[0] ?? null
})

export type Category = typeof category.$inferSelect
export type Movement = typeof movement.$inferSelect
export type Installment = typeof installment.$inferSelect
export type InstallmentRow = Installment & { statementPeriod: string | null }
export type MovementWithInstallments = Movement & { installments: InstallmentRow[] }

export function selectCategories(
  tx: Tx,
  userId: string,
  kind?: "income" | "expense",
  includeArchived = false,
): Promise<Category[]> {
  const conditions = [eq(category.userId, userId)]
  if (kind) conditions.push(eq(category.kind, kind))
  if (!includeArchived) conditions.push(eq(category.archived, false))

  return tx
    .select()
    .from(category)
    .where(and(...conditions))
    .orderBy(asc(category.name))
}

export const listCategories = cache(async function listCategories(
  userId: string,
  kind?: "income" | "expense",
  includeArchived = false,
): Promise<Category[]> {
  return withUser(userId, (tx) => selectCategories(tx, userId, kind, includeArchived))
})

export const countMovementsByCategory = cache(async function countMovementsByCategory(
  userId: string,
): Promise<Map<string, number>> {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ categoryId: movement.categoryId, total: count() })
      .from(movement)
      .where(and(eq(movement.userId, userId), isNotNull(movement.categoryId)))
      .groupBy(movement.categoryId),
  )
  return new Map(rows.map((r) => [r.categoryId!, r.total]))
})

export type MovementFilters = {
  kind?: "income" | "expense" | "exchange"
  categoryId?: string
  categoryIds?: string[]
  cardId?: string
  currency?: "ARS" | "USD"
  from?: string
  to?: string
  dateField?: "date" | "paid"
  minCents?: number
  maxCents?: number
  search?: string
}

function escapeLike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

function movementConditions(userId: string, filters: MovementFilters) {
  const conditions = [eq(movement.userId, userId)]
  if (filters.kind) conditions.push(eq(movement.kind, filters.kind))

  const selectedCategories = [
    ...(filters.categoryId ? [filters.categoryId] : []),
    ...(filters.categoryIds ?? []),
  ]
  if (selectedCategories.length > 0) {
    const idsSql = sql.join(
      selectedCategories.map((id) => sql`${id}`),
      sql`, `,
    )
    // Subconsulta NO correlacionada: Postgres resuelve una vez el puñado de
    // ids (las elegidas y sus hijas) y cruza por `movement_category_idx`, en
    // vez de evaluar un EXISTS por cada movimiento.
    conditions.push(
      sql`${movement.categoryId} IN (
        SELECT c."id" FROM "category" c
        WHERE c."user_id" = ${userId}
          AND (c."id" IN (${idsSql}) OR c."parent_id" IN (${idsSql}))
      )`,
    )
  }

  if (filters.cardId === CARD_FILTER_CASH) {
    conditions.push(isNull(movement.creditCardId))
  } else if (filters.cardId) {
    conditions.push(eq(movement.creditCardId, filters.cardId))
  }

  if (filters.currency) conditions.push(eq(movement.currency, filters.currency))
  if (filters.dateField === "paid" && (filters.from || filters.to)) {
    const paidBounds = [
      sql`i."movement_id" = ${movement.id}`,
      sql`i."user_id" = ${userId}`,
      sql`i."paid" = true`,
    ]
    if (filters.from) paidBounds.push(sql`i."paid_date" >= ${filters.from}`)
    if (filters.to) paidBounds.push(sql`i."paid_date" <= ${filters.to}`)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM "installment" i WHERE ${sql.join(paidBounds, sql` AND `)})`,
    )
  } else {
    if (filters.from) conditions.push(gte(movement.date, filters.from))
    if (filters.to) conditions.push(lte(movement.date, filters.to))
  }
  if (filters.minCents !== undefined) conditions.push(gte(movement.amountCents, filters.minCents))
  if (filters.maxCents !== undefined) conditions.push(lte(movement.amountCents, filters.maxCents))

  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`
    const searchOr = [
      ilike(movement.description, pattern),
      // Busca también en el nombre de la categoría y de su padre. Igual que
      // el filtro por categoría: una subconsulta no correlacionada.
      sql`${movement.categoryId} IN (
        SELECT c."id" FROM "category" c
        LEFT JOIN "category" p ON p."id" = c."parent_id" AND p."user_id" = c."user_id"
        WHERE c."user_id" = ${userId}
          AND (c."name" ILIKE ${pattern} OR p."name" ILIKE ${pattern})
      )`,
    ]

    const cleanedAmount = filters.search.trim().replace(/^(?:US\$|\$)\s*/i, "")
    const amountCents = parseAmountToCents(cleanedAmount)
    if (amountCents !== null && amountCents >= 0) {
      searchOr.push(eq(movement.amountCents, amountCents))
    }

    conditions.push(or(...searchOr)!)
  }
  return conditions
}

/**
 * El orden de las dos listas. El `id` al final no lo pide ninguna pantalla: es
 * el desempate que hace determinista al LIMIT/OFFSET de `queryMovementsView`.
 * Sin él, dos movimientos del mismo día cargados en la misma transacción
 * comparten `(date, created_at)` y Postgres puede devolverlos en distinto orden
 * en cada consulta — o sea, la misma fila en dos páginas y otra en ninguna.
 */
const MOVEMENT_ORDER = [desc(movement.date), desc(movement.createdAt), desc(movement.id)]

/**
 * `ORDER BY` de la lista según `sort` y `dir`. Siempre termina en
 * `MOVEMENT_ORDER` como desempate, para que LIMIT/OFFSET sea determinista.
 */
function movementOrderBy(
  query: Pick<MovementQuery, "sort" | "dir">,
  earliestUnpaidDue: SQL.Aliased<string | null>,
  parentCategory: typeof category,
): SQL[] {
  const tieBreak = MOVEMENT_ORDER
  const dir = query.dir === "asc" ? sql`asc` : sql`desc`
  switch (query.sort) {
    case "date":
      return query.dir === "asc"
        ? [asc(movement.date), asc(movement.createdAt), asc(movement.id)]
        : tieBreak
    case "amount":
      return [
        sql`${movement.amountCents} ${dir}`,
        ...tieBreak,
      ]
    case "description":
      return [sql`lower(${movement.description}) ${dir}`, ...tieBreak]
    case "category":
      // "Padre › Hija" como se ve en la tabla; sin categoría va al final.
      return [
        sql`lower(case when ${parentCategory.name} is null then ${category.name} else ${parentCategory.name} || ' › ' || ${category.name} end) ${dir} nulls last`,
        ...tieBreak,
      ]
    case "due":
    default:
      return [sql`${earliestUnpaidDue} ${dir} nulls last`, ...tieBreak]
  }
}

/** Le cuelga a cada movimiento sus cuotas, ordenadas por número. */
async function conCuotas(
  tx: Tx,
  userId: string,
  movements: Movement[],
): Promise<MovementWithInstallments[]> {
  if (movements.length === 0) return []

  const rows = await tx
    .select({ installment, statementPeriod: cardStatement.period })
    .from(installment)
    .leftJoin(cardStatement, eq(installment.statementId, cardStatement.id))
    .where(
      and(
        eq(installment.userId, userId),
        inArray(
          installment.movementId,
          movements.map((m) => m.id),
        ),
      ),
    )
    .orderBy(asc(installment.number))

  const byMovement = new Map<string, InstallmentRow[]>()
  for (const { installment: row, statementPeriod } of rows) {
    const list = byMovement.get(row.movementId) ?? []
    list.push({ ...row, statementPeriod })
    byMovement.set(row.movementId, list)
  }

  return movements.map((m) => ({ ...m, installments: byMovement.get(m.id) ?? [] }))
}

/** Los movimientos que pasan el filtro, con las cuotas colgadas. */
export async function listMovements(
  userId: string,
  filters: MovementFilters = {},
): Promise<MovementWithInstallments[]> {
  return withUser(userId, async (tx) => {
    const movements = await tx
      .select()
      .from(movement)
      .where(and(...movementConditions(userId, filters)))
      .orderBy(...MOVEMENT_ORDER)

    return conCuotas(tx, userId, movements)
  })
}

export type MovementListView = Page<MovementWithInstallments> & {
  statusCounts: StatusCounts
  totals: FilterTotals
}

const ZERO_TOTALS: FilterTotals = {
  pending: { arsCents: 0, usdCents: 0 },
  overdue: { arsCents: 0, usdCents: 0 },
  paid: { arsCents: 0, usdCents: 0 },
}

/**
 * Consulta compartida de /ingresos, /egresos y la carga incremental móvil:
 * resuelve en SQL los conteos por estado (antes del filtro de estado, para que
 * las pastillas conserven sus números al cambiar de estado), los totales por
 * estado de cuota y moneda (respetando lo percibido), el ordenamiento (`due`,
 * `date`, `amount` consolidado a ARS) y la paginación (`LIMIT`/`OFFSET`),
 * trayendo a Node sólo las cuotas de la página actual.
 *
 * `includeTotals: false` saltea la suma de cuotas por estado: "Cargar más"
 * sólo necesita la página siguiente y cuántas hay, no los totales.
 */
export async function queryMovementsView(
  userId: string,
  kind: "income" | "expense",
  query: MovementQuery,
  today: IsoDate,
  { includeTotals = true }: { includeTotals?: boolean } = {},
): Promise<MovementListView> {
  return withUser(userId, async (tx) => {
    const baseConditions = movementConditions(userId, {
      kind,
      ...movementFiltersFromQuery(query),
    })
    const baseWhere = and(...baseConditions)

    // Sólo las cuotas de los movimientos que pasan el filtro, no todas las
    // del usuario: con años de historia, agrupar todo era lo que más pesaba.
    const instStats = tx.$with("inst_stats").as(
      tx
        .select({
          movementId: installment.movementId,
          pendingCount: sql<number>`count(*) filter (where ${installment.paid} = false)`.as(
            "pending_count",
          ),
          overdueCount:
            sql<number>`count(*) filter (where ${installment.paid} = false and ${installment.dueDate} < ${today})`.as(
              "overdue_count",
            ),
          earliestUnpaidDue:
            sql<string | null>`min(${installment.dueDate}) filter (where ${installment.paid} = false)`.as(
              "earliest_unpaid_due",
            ),
        })
        .from(installment)
        .where(
          and(
            eq(installment.userId, userId),
            inArray(
              installment.movementId,
              tx.select({ id: movement.id }).from(movement).where(baseWhere),
            ),
          ),
        )
        .groupBy(installment.movementId),
    )

    const [countsRow] = await tx
      .with(instStats)
      .select({
        all: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where coalesce(${instStats.overdueCount}, 0) > 0)::int`,
        pending: sql<number>`count(*) filter (where coalesce(${instStats.pendingCount}, 0) > 0 and coalesce(${instStats.overdueCount}, 0) = 0)::int`,
        paid: sql<number>`count(*) filter (where coalesce(${instStats.pendingCount}, 0) = 0)::int`,
      })
      .from(movement)
      .leftJoin(instStats, eq(instStats.movementId, movement.id))
      .where(baseWhere)

    const statusCounts: StatusCounts = {
      all: countsRow?.all ?? 0,
      overdue: countsRow?.overdue ?? 0,
      pending: countsRow?.pending ?? 0,
      paid: countsRow?.paid ?? 0,
    }

    const totalCount = statusCounts[query.status]
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    const current = Math.min(Math.max(1, query.page), totalPages)

    if (totalCount === 0) {
      return {
        items: [],
        page: current,
        totalPages,
        totalCount: 0,
        statusCounts,
        totals: ZERO_TOTALS,
      }
    }

    const filteredConditions = [...baseConditions]
    if (query.status === "paid") {
      filteredConditions.push(sql`coalesce(${instStats.pendingCount}, 0) = 0`)
    } else if (query.status === "overdue") {
      filteredConditions.push(sql`coalesce(${instStats.overdueCount}, 0) > 0`)
    } else if (query.status === "pending") {
      filteredConditions.push(
        sql`coalesce(${instStats.pendingCount}, 0) > 0 and coalesce(${instStats.overdueCount}, 0) = 0`,
      )
    }
    const filteredWhere = and(...filteredConditions)

    let totals = ZERO_TOTALS
    if (includeTotals) {
      let totalsQuery = tx
        .with(instStats)
        .select({
          pendingArs: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'ARS' and ${installment.paid} = false and ${installment.dueDate} >= ${today}), 0)`,
          pendingUsd: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'USD' and ${installment.paid} = false and ${installment.dueDate} >= ${today}), 0)`,
          overdueArs: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'ARS' and ${installment.paid} = false and ${installment.dueDate} < ${today}), 0)`,
          overdueUsd: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'USD' and ${installment.paid} = false and ${installment.dueDate} < ${today}), 0)`,
          paidArs: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'ARS' and ${installment.paid} = true), 0)`,
          paidUsd: sql<string>`coalesce(sum(${installment.amountCents}) filter (where ${movement.currency} = 'USD' and ${installment.paid} = true), 0)`,
        })
        .from(movement)
        .innerJoin(
          installment,
          and(eq(installment.movementId, movement.id), eq(installment.userId, userId)),
        )
        .$dynamic()
      // Con estado "todos" el filtro no mira `inst_stats`: Postgres ni
      // ejecuta un CTE que nadie referencia.
      if (query.status !== "all") {
        totalsQuery = totalsQuery.leftJoin(instStats, eq(instStats.movementId, movement.id))
      }
      const [totalsRow] = await totalsQuery.where(filteredWhere)

      totals = {
        pending: {
          arsCents: Number(totalsRow?.pendingArs ?? 0),
          usdCents: Number(totalsRow?.pendingUsd ?? 0),
        },
        overdue: {
          arsCents: Number(totalsRow?.overdueArs ?? 0),
          usdCents: Number(totalsRow?.overdueUsd ?? 0),
        },
        paid: {
          arsCents: Number(totalsRow?.paidArs ?? 0),
          usdCents: Number(totalsRow?.paidUsd ?? 0),
        },
      }
    }

    const parentCategory = aliasedTable(category, "parent_category")
    const orderBy = movementOrderBy(query, instStats.earliestUnpaidDue, parentCategory)

    let rowsQuery = tx
      .with(instStats)
      .select({ movement })
      .from(movement)
      .leftJoin(instStats, eq(instStats.movementId, movement.id))
      .$dynamic()
    // Las categorías sólo hacen falta para ordenar por "Padre › Hija".
    if (query.sort === "category") {
      rowsQuery = rowsQuery
        .leftJoin(
          category,
          and(eq(category.id, movement.categoryId), eq(category.userId, movement.userId)),
        )
        .leftJoin(
          parentCategory,
          and(
            eq(parentCategory.id, category.parentId),
            eq(parentCategory.userId, movement.userId),
          ),
        )
    }
    const movementRows = await rowsQuery
      .where(filteredWhere)
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((current - 1) * PAGE_SIZE)

    const items = await conCuotas(
      tx,
      userId,
      movementRows.map((r) => r.movement),
    )

    return {
      items,
      page: current,
      totalPages,
      totalCount,
      statusCounts,
      totals,
    }
  })
}

/**
 * Las cuotas pagadas, ya leídas como lo percibido (`perceivedPayments`). Con
 * `from` sólo las pagadas desde esa fecha: el dashboard las quiere para los
 * gráficos y los totales del mes, no para el saldo (eso es `getBalances`).
 *
 * El piso no parte un resumen pagado en pesos: todas sus cuotas comparten la
 * fecha de pago del resumen (trigger `installment_matches_statement`).
 */
export async function selectPaidInstallments(
  tx: Tx,
  userId: string,
  { from }: { from?: IsoDate } = {},
) {
  const conditions = [eq(installment.userId, userId), eq(installment.paid, true)]
  if (from) conditions.push(gte(installment.paidDate, from))

  const rows = await tx
    .select({
      paidDate: installment.paidDate,
      amountCents: installment.amountCents,
      currency: movement.currency,
      kind: movement.kind,
      categoryId: movement.categoryId,
      statementId: installment.statementId,
      usdPaidArsCents: cardStatement.usdPaidArsCents,
    })
    .from(installment)
    .innerJoin(movement, eq(installment.movementId, movement.id))
    .leftJoin(cardStatement, eq(installment.statementId, cardStatement.id))
    .where(and(...conditions))

  return perceivedPayments(rows.map((r) => ({ ...r, paidDate: assertPaidDate(r.paidDate) })))
}

export async function listPaidInstallments(userId: string, options: { from?: IsoDate } = {}) {
  return withUser(userId, (tx) => selectPaidInstallments(tx, userId, options))
}

export type ReportPaidFilters = {
  from?: IsoDate
  to?: IsoDate
  categoryIds?: string[]
  cardId?: string
  minCents?: number
  maxCents?: number
  search?: string
}

/**
 * Cuotas pagadas para el informe de Ingresos vs Gastos, acotadas por
 * `paid_date` más los filtros de la barra compartida. Pasa por
 * `perceivedPayments` igual que `listPaidInstallments`.
 */
export async function listPaidInstallmentsForReport(
  userId: string,
  filters: ReportPaidFilters = {},
) {
  return withUser(userId, async (tx) => {
    const conditions = [
      eq(installment.userId, userId),
      eq(installment.paid, true),
      inArray(movement.kind, ["income", "expense"]),
      ...movementConditions(userId, {
        categoryIds: filters.categoryIds,
        cardId: filters.cardId,
        minCents: filters.minCents,
        maxCents: filters.maxCents,
        search: filters.search,
      }),
    ]
    if (filters.from) conditions.push(gte(installment.paidDate, filters.from))
    if (filters.to) conditions.push(lte(installment.paidDate, filters.to))

    /*
     * El total en dólares de cada resumen pagado en pesos, calculado una vez
     * por resumen y no con una subconsulta por cada cuota. Hace falta entero
     * (sin los filtros del informe) para repartir los pesos en proporción.
     */
    const i2 = aliasedTable(installment, "i2")
    const m2 = aliasedTable(movement, "m2")
    const s2 = aliasedTable(cardStatement, "s2")
    const statementConditions = [
      eq(i2.userId, userId),
      eq(m2.currency, "USD"),
      isNotNull(s2.usdPaidArsCents),
    ]
    // Una cuota de un resumen comparte su fecha de pago: los resúmenes que
    // importan son los pagados dentro del mismo rango.
    if (filters.from) statementConditions.push(gte(s2.paidDate, filters.from))
    if (filters.to) statementConditions.push(lte(s2.paidDate, filters.to))
    const statementUsd = tx.$with("statement_usd").as(
      tx
        .select({
          // Nombres propios: drizzle referencia las columnas del CTE sin
          // calificar, y `statement_id` chocaría con la de `installment`.
          statementId: sql<string>`${i2.statementId}`.as("usd_statement_id"),
          usdCents: sql<string>`sum(${i2.amountCents})`.as("statement_usd_cents"),
        })
        .from(i2)
        .innerJoin(m2, eq(m2.id, i2.movementId))
        .innerJoin(s2, eq(s2.id, i2.statementId))
        .where(and(...statementConditions))
        .groupBy(i2.statementId),
    )

    const rows = await tx
      .with(statementUsd)
      .select({
        paidDate: installment.paidDate,
        amountCents: installment.amountCents,
        currency: movement.currency,
        kind: movement.kind,
        categoryId: movement.categoryId,
        statementId: installment.statementId,
        usdPaidArsCents: cardStatement.usdPaidArsCents,
        statementUsdCents: sql<string | null>`case when ${cardStatement.usdPaidArsCents} is null then null else coalesce(${statementUsd.usdCents}, 0) end`,
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .leftJoin(cardStatement, eq(installment.statementId, cardStatement.id))
      .leftJoin(statementUsd, eq(statementUsd.statementId, installment.statementId))
      .where(and(...conditions))

    return perceivedPayments(
      rows.map((r) => ({
        ...r,
        paidDate: assertPaidDate(r.paidDate),
        statementUsdCents: r.statementUsdCents === null ? null : Number(r.statementUsdCents),
      })),
    )
  })
}

/** Todas las cuotas pendientes, para deudas, cobros y proyección. */
export function selectPendingInstallments(tx: Tx, userId: string) {
  return tx
    .select({
      id: installment.id,
      number: installment.number,
      dueDate: installment.dueDate,
      amountCents: installment.amountCents,
      movementId: movement.id,
      description: movement.description,
      currency: movement.currency,
      kind: movement.kind,
      // Para que el dashboard muestre un resumen de tarjeta como un solo
      // renglón y no cada cuota suelta (§1.4 del plan v2).
      statementId: installment.statementId,
      statementPeriod: cardStatement.period,
      cardId: creditCard.id,
      cardName: creditCard.name,
    })
    .from(installment)
    .innerJoin(movement, eq(installment.movementId, movement.id))
    .leftJoin(cardStatement, eq(installment.statementId, cardStatement.id))
    .leftJoin(creditCard, eq(cardStatement.cardId, creditCard.id))
    .where(and(eq(installment.userId, userId), eq(installment.paid, false)))
    .orderBy(asc(installment.dueDate))
}

export async function listPendingInstallments(userId: string) {
  return withUser(userId, (tx) => selectPendingInstallments(tx, userId))
}

/**
 * Cambios de divisa, para /cambios. Trae TODOS, sin piso de fecha. El saldo
 * no los necesita: lo calcula `getBalances` en la base.
 */
export async function listExchanges(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select()
      .from(movement)
      .where(and(eq(movement.userId, userId), eq(movement.kind, "exchange")))
      .orderBy(asc(movement.date)),
  )
}

export type BalanceStart = {
  initialArsCents: number
  initialUsdCents: number
  initialDate: IsoDate
}

/**
 * El saldo en pesos y dólares a `asOf` (inclusive), sumado en la base en vez
 * de traer a Node todo el historial de cuotas pagadas y cambios. Es la misma
 * cuenta que `computeBalances(perceivedPayments(...))` — los tests de
 * `queries.db.test.ts` comparan las dos sobre los mismos datos:
 *
 * - Cada cuota pagada entre `initialDate` y `asOf`, con signo según el tipo.
 * - Lo percibido: las cuotas en dólares de un resumen pagado en pesos no
 *   restan dólares; el resumen resta sus `usd_paid_ars_cents` en pesos. Todas
 *   comparten la fecha de pago del resumen, así que el corte de fechas no lo
 *   parte, y son siempre egresos (sólo un egreso va con tarjeta).
 * - Cada cambio de divisa en la ventana, con la pata en pesos redondeada por
 *   cambio en doble precisión, igual que `convertToArs` (`Math.round`).
 */
export async function selectBalances(
  tx: Tx,
  userId: string,
  start: BalanceStart,
  asOf: IsoDate,
): Promise<{ arsCents: number; usdCents: number }> {
  const rows = await tx.execute<{ ars_cents: string | null; usd_cents: string | null }>(sql`
    with paid as (
      select
        m.currency,
        case when m.kind = 'income' then i.amount_cents else -i.amount_cents end as signed_cents,
        i.amount_cents,
        i.statement_id,
        s.usd_paid_ars_cents
      from ${installment} i
      join ${movement} m on m.id = i.movement_id and m.user_id = i.user_id
      left join ${cardStatement} s on s.id = i.statement_id and s.user_id = i.user_id
      where i.user_id = ${userId}
        and i.paid = true
        and i.paid_date >= ${start.initialDate}
        and i.paid_date <= ${asOf}
    ),
    paid_in_pesos as (
      select statement_id, max(usd_paid_ars_cents) as ars_cents
      from paid
      where currency = 'USD' and statement_id is not null and usd_paid_ars_cents is not null
      group by statement_id
      having sum(amount_cents) > 0
    ),
    fx as (
      select
        m.direction,
        m.amount_cents as usd_cents,
        floor(m.amount_cents::float8 * m.rate::float8 + 0.5)::bigint as ars_cents
      from ${movement} m
      where m.user_id = ${userId}
        and m.kind = 'exchange'
        and m.date >= ${start.initialDate}
        and m.date <= ${asOf}
    )
    select
      coalesce((select sum(signed_cents) from paid where currency = 'ARS'), 0)
        - coalesce((select sum(ars_cents) from paid_in_pesos), 0)
        + coalesce((select sum(case when direction = 'sell' then ars_cents else -ars_cents end) from fx), 0)
        as ars_cents,
      coalesce((
        select sum(signed_cents) from paid
        where currency = 'USD' and (statement_id is null or usd_paid_ars_cents is null)
      ), 0)
        + coalesce((select sum(case when direction = 'buy' then usd_cents else -usd_cents end) from fx), 0)
        as usd_cents
  `)
  const [row] = [...rows]
  return {
    arsCents: start.initialArsCents + Number(row?.ars_cents ?? 0),
    usdCents: start.initialUsdCents + Number(row?.usd_cents ?? 0),
  }
}

export async function getBalances(userId: string, start: BalanceStart, asOf: IsoDate) {
  return withUser(userId, (tx) => selectBalances(tx, userId, start, asOf))
}

/** El punto de partida del saldo, tal como lo guarda `user_settings`. */
export function balanceStart(settings: Settings): BalanceStart {
  return {
    initialArsCents: settings.initialBalanceArsCents,
    initialUsdCents: settings.initialBalanceUsdCents,
    initialDate: settings.initialBalanceDate,
  }
}
