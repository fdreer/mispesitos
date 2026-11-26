import "server-only"

import { cache } from "react"

import {
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
import { perceivedPayment } from "@/lib/cards"
import type { IsoDate } from "@/lib/dates"
import { parseAmountToCents } from "@/lib/money"
import {
  assertExchangeDirection,
  assertInstallmentMovementKind,
  assertPaidDate,
} from "@/lib/movement-asserts"
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
import { buildUsdPositionEvents, type PositionEvent } from "@/lib/position"

export type Settings = typeof userSettings.$inferSelect

/**
 * Memoizada por request, mismo motivo que `getOptionalUser` (@/server/session):
 * `requireSettings()` la llama desde el layout de (app) y otra vez desde cada
 * página, y cada llamada abre su propia transacción.
 *
 * Es la consulta que más se repite dentro de un mismo request, y desde que
 * `listUsdPositionEvents` (más abajo) también pasa por acá en vez de
 * seleccionar la fila por su cuenta, /cambios la resuelve una sola vez.
 */
export const getSettings = cache(async (userId: string): Promise<Settings | null> => {
  const rows = await withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  )
  return rows[0] ?? null
})

export type Category = typeof category.$inferSelect
export type Movement = typeof movement.$inferSelect
export type Installment = typeof installment.$inferSelect
/**
 * La cuota tal como la ven las listas: con el período de su resumen cuando la
 * compra es con tarjeta, para que la fila diga "se paga con el resumen de
 * nov" y enlace a él.
 */
export type InstallmentRow = Installment & { statementPeriod: string | null }
export type MovementWithInstallments = Movement & { installments: InstallmentRow[] }


/**
 * Sólo las categorías activas por default: la Task 16 permite archivar una
 * categoría precisamente para que deje de ofrecerse al cargar un movimiento.
 * La propia pantalla de categorías (Task 16) necesita ver también las
 * archivadas para listarlas, de ahí el parámetro en vez de duplicar la query.
 *
 * Memoizada por request, igual que `getSettings`. Desde que /ingresos y
 * /egresos transmiten la pantalla por partes (ver `movement-screen.tsx`), la
 * barra de filtros y la tabla son dos ramas independientes del árbol que piden
 * LA MISMA lista completa de categorías: sin este memo, cada carga abre dos
 * transacciones idénticas. La clave del memo son los argumentos tal como se
 * pasan, así que `(id, kind)` y `(id, kind, false)` son dos entradas distintas
 * con el mismo resultado — inofensivo, pero por eso las dos ramas llaman con
 * la misma forma.
 */
export const listCategories = cache(async function listCategories(
  userId: string,
  kind?: "income" | "expense",
  includeArchived = false,
): Promise<Category[]> {
  return withUser(userId, (tx) => {
    const conditions = [eq(category.userId, userId)]
    if (kind) conditions.push(eq(category.kind, kind))
    if (!includeArchived) conditions.push(eq(category.archived, false))

    return tx
      .select()
      .from(category)
      .where(and(...conditions))
      .orderBy(asc(category.name))
  })
})

/**
 * Cuántos movimientos tiene cada categoría, por id. Lo usa /categorias para
 * saber si darle la primera subcategoría a una categoría obliga a decidir a
 * dónde van sus movimientos (§2.1 del plan v2), y para decirle a la persona
 * cuántos son. Sólo trae las categorías con al menos uno.
 */
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
  /** Compatibilidad con llamadores simples; se combina con `categoryIds`. */
  categoryId?: string
  /** Lista de categorías elegidas (puede incluir padres; trae sus hijas). */
  categoryIds?: string[]
  /** Id de tarjeta, `"cash"` para efectivo/débito/transferencia, o undefined. */
  cardId?: string
  currency?: "ARS" | "USD"
  from?: string
  to?: string
  /** `"date"` (default: `movement.date`) o `"paid"` (cuotas pagadas en ese rango). */
  dateField?: "date" | "paid"
  minCents?: number
  maxCents?: number
  /** Texto libre contra descripción, categoría o importe. */
  search?: string
}

/**
 * `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" traería TODA la
 * lista en vez de las descripciones que dicen "50%". La barra va primero o se
 * escaparía a sí misma en los dos reemplazos siguientes.
 */
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
    // Filtrar por un padre trae también lo de sus subcategorías: los
    // movimientos van siempre a una hoja (decisión 7.4 del plan v2). La
    // subconsulta corre bajo la misma RLS que la principal.
    const idsSql = sql.join(
      selectedCategories.map((id) => sql`${id}`),
      sql`, `,
    )
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM "category" c
        WHERE c."id" = ${movement.categoryId}
          AND c."user_id" = ${userId}
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
      // Busca también en el nombre de la categoría y de su padre.
      sql`EXISTS (
        SELECT 1 FROM "category" c
        LEFT JOIN "category" p ON p."id" = c."parent_id"
        WHERE c."id" = ${movement.categoryId}
          AND c."user_id" = ${userId}
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

/**
 * Consulta compartida de /ingresos, /egresos y la carga incremental móvil:
 * resuelve en SQL los conteos por estado (antes del filtro de estado, para que
 * las pastillas conserven sus números al cambiar de estado), los totales por
 * estado de cuota y moneda (respetando lo percibido), el ordenamiento (`due`,
 * `date`, `amount` consolidado a ARS) y la paginación (`LIMIT`/`OFFSET`),
 * trayendo a Node sólo las cuotas de la página actual.
 */
export async function queryMovementsView(
  userId: string,
  kind: "income" | "expense",
  query: MovementQuery,
  today: IsoDate,
): Promise<MovementListView> {
  return withUser(userId, async (tx) => {
    const baseConditions = movementConditions(userId, {
      kind,
      ...movementFiltersFromQuery(query),
    })
    const baseWhere = and(...baseConditions)

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
        .where(eq(installment.userId, userId))
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
        totals: {
          pending: { arsCents: 0, usdCents: 0 },
          overdue: { arsCents: 0, usdCents: 0 },
          paid: { arsCents: 0, usdCents: 0 },
        },
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

    const [totalsRow] = await tx
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
      .leftJoin(instStats, eq(instStats.movementId, movement.id))
      .innerJoin(
        installment,
        and(eq(installment.movementId, movement.id), eq(installment.userId, userId)),
      )
      .where(filteredWhere)

    const totals: FilterTotals = {
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

    const orderBy =
      query.sort === "date"
        ? MOVEMENT_ORDER
        : query.sort === "amount"
          ? [
              sql`case when ${movement.currency} = 'ARS' then ${movement.amountCents}::numeric else round(${movement.amountCents}::numeric * ${movement.rate}) end desc`,
              ...MOVEMENT_ORDER,
            ]
          : [sql`${instStats.earliestUnpaidDue} asc nulls last`, ...MOVEMENT_ORDER]

    const movementRows = await tx
      .with(instStats)
      .select({ movement })
      .from(movement)
      .leftJoin(instStats, eq(instStats.movementId, movement.id))
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

/** Todas las cuotas pagadas, para el cálculo de saldo. */
export async function listPaidInstallments(userId: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        paidDate: installment.paidDate,
        amountCents: installment.amountCents,
        currency: movement.currency,
        kind: movement.kind,
        // Para la torta del dashboard, que suma cuotas pagadas por categoría
        // (criterio de lo percibido, §0 del plan v2).
        categoryId: movement.categoryId,
        // Necesario para consolidar a pesos con el TC del propio movimiento.
        rate: movement.rate,
        // El TC al que se pagó en pesos la parte en dólares del resumen, si
        // fue así (decisión 7.1 del plan v2). Null sin tarjeta.
        usdPaidRate: cardStatement.usdPaidRate,
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .leftJoin(cardStatement, eq(installment.statementId, cardStatement.id))
      .where(and(eq(installment.userId, userId), eq(installment.paid, true)))

    // El filtro `paid = true` ya está arriba: acá es donde vive el saber que
    // convierte `paidDate` de `string | null` a `IsoDate`.
    //
    // Y acá, en un solo lugar, una cuota en dólares cuyo resumen se pagó con
    // pesos pasa a contar como pesos (`perceivedPayment`): el saldo, la torta
    // y las barras salen de esta lista y ninguno tiene que saber de tarjetas.
    return rows.map((r) => perceivedPayment({ ...r, paidDate: assertPaidDate(r.paidDate) }))
  })
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
 * Cuotas pagadas para el informe de Ingresos vs Gastos (§3.1 del plan v2),
 * acotadas por `paid_date` más los filtros de la barra compartida (categoría,
 * tarjeta, importes, buscador). Pasa por `perceivedPayment` igual que
 * `listPaidInstallments`.
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

    const rows = await tx
      .select({
        paidDate: installment.paidDate,
        amountCents: installment.amountCents,
        currency: movement.currency,
        kind: movement.kind,
        categoryId: movement.categoryId,
        rate: movement.rate,
        usdPaidRate: cardStatement.usdPaidRate,
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .leftJoin(cardStatement, eq(installment.statementId, cardStatement.id))
      .where(and(...conditions))

    return rows.map((r) => perceivedPayment({ ...r, paidDate: assertPaidDate(r.paidDate) }))
  })
}

/** Todas las cuotas pendientes, para deudas, cobros y proyección. */
export async function listPendingInstallments(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select({
        id: installment.id,
        number: installment.number,
        dueDate: installment.dueDate,
        amountCents: installment.amountCents,
        movementId: movement.id,
        description: movement.description,
        currency: movement.currency,
        rate: movement.rate,
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
      .orderBy(asc(installment.dueDate)),
  )
}

/**
 * Cambios de divisa, para saldo y posición. Trae TODOS, sin piso de fecha: los
 * dos llamadores necesitan la lista completa y cada uno decide el corte.
 * `computeBalances` (@/lib/balance) lo aplica en memoria para el dashboard, y
 * /cambios parte la lista en dos —las que mueven sus tarjetas y las anteriores
 * al saldo inicial, que muestra aparte para que se puedan ver y borrar—.
 *
 * Un corte por fecha en el WHERE le sacaría a los dos esa decisión, y en
 * /cambios dejaba las operaciones anteriores al saldo inicial invisibles en
 * toda la app.
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

/**
 * Todo lo que toca la tenencia de dólares: el saldo inicial, los cambios y
 * las cuotas pagadas en USD. Sección 5.5 del spec — toda salida realiza
 * resultado, se venda o se gaste.
 *
 * Filtra cambios y cuotas por `date >= initialBalanceDate` en la propia
 * consulta (no trae todo y filtra en memoria): evita traerse historia vieja
 * irrelevante para la posición. El armado de eventos en sí —sembrar el saldo
 * inicial, repetir ese mismo corte de fecha como garantía propia, y
 * convertir el `numeric` de la base a number— es la parte pura
 * `buildUsdPositionEvents` (@/lib/position), separada acá justamente para
 * poder probarla sin tocar la base.
 */
export async function listUsdPositionEvents(userId: string): Promise<PositionEvent[]> {
  // Por `getSettings` y no por un select propio: /cambios ya la pidió —el
  // layout de (app) y la página pasan por `requireSettings()`—, así que el
  // memo de request la resuelve sin volver a la base. Antes esta función abría
  // su propia transacción para leer la misma fila.
  const row = await getSettings(userId)

  // requireSettings() exige onboarding completo antes de llegar acá: en la
  // práctica esta fila siempre existe. Sin ella no hay saldo inicial que
  // sembrar ni piso de fecha que aplicar.
  if (!row) return []

  const settings = {
    usdCents: row.initialBalanceUsdCents,
    rate: row.initialBalanceUsdRate,
    date: row.initialBalanceDate,
  }

  return withUser(userId, async (tx) => {
    const exchanges = await tx
      .select({
        date: movement.date,
        usdCents: movement.amountCents,
        rate: movement.rate,
        direction: movement.direction,
      })
      .from(movement)
      .where(
        and(
          eq(movement.userId, userId),
          eq(movement.kind, "exchange"),
          gte(movement.date, settings.date),
        ),
      )

    const usdInstallments = await tx
      .select({
        date: installment.paidDate,
        usdCents: installment.amountCents,
        rate: movement.rate,
        kind: movement.kind,
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .leftJoin(cardStatement, eq(installment.statementId, cardStatement.id))
      .where(
        and(
          eq(installment.userId, userId),
          eq(installment.paid, true),
          eq(movement.currency, "USD"),
          gte(installment.paidDate, settings.date),
          // Una compra en dólares con tarjeta cuyo resumen se pagó con pesos
          // no tocó la tenencia de dólares (decisión 7.1 del plan v2): para
          // la posición, esa cuota no existe.
          isNull(cardStatement.usdPaidRate),
        ),
      )

    return buildUsdPositionEvents(
      settings,
      exchanges.map((e) => ({
        date: e.date,
        usdCents: e.usdCents,
        rate: e.rate,
        direction: assertExchangeDirection(e.direction),
      })),
      usdInstallments.map((i) => ({
        // Mismo invariante que en `listPaidInstallments`, y por el mismo helper:
        // la consulta ya filtró `paid = true`, y con `paid = true` la CHECK
        // `installment_paid_date_required_when_paid` (migración 0009) exige
        // `paid_date`. El `!` que había acá se apoyaba además en que el `gte`
        // de arriba nunca matchea un nulo: el día que ese filtro se relajara,
        // en vez de fallar el assert entraba un `undefined` a ordenar.
        date: assertPaidDate(i.date),
        usdCents: i.usdCents,
        rate: i.rate,
        kind: assertInstallmentMovementKind(i.kind),
      })),
    )
  })
}
