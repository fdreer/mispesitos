import "server-only"

import { cache } from "react"

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm"

import { withUser, type Tx } from "@/db/client"
import { category, installment, movement, userSettings } from "@/db/schema"
import {
  assertExchangeDirection,
  assertInstallmentMovementKind,
  assertPaidDate,
} from "@/lib/movement-asserts"
import { PAGE_SIZE, type Page } from "@/lib/movement-query"
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
export type MovementWithInstallments = Movement & { installments: Installment[] }

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
  categoryId?: string
  currency?: "ARS" | "USD"
  from?: string
  to?: string
  /** Texto libre contra la descripción, sin distinguir mayúsculas. */
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
  if (filters.categoryId) {
    // Filtrar por un padre trae también lo de sus subcategorías: los
    // movimientos van siempre a una hoja (decisión 7.4 del plan v2), así que
    // filtrar sólo por el id del padre daría una lista vacía. La subconsulta
    // corre bajo la misma RLS que la principal.
    conditions.push(
      or(
        eq(movement.categoryId, filters.categoryId),
        inArray(
          movement.categoryId,
          sql`(SELECT ${category.id} FROM ${category} WHERE ${category.parentId} = ${filters.categoryId})`,
        ),
      )!,
    )
  }
  if (filters.currency) conditions.push(eq(movement.currency, filters.currency))
  if (filters.from) conditions.push(gte(movement.date, filters.from))
  if (filters.to) conditions.push(lte(movement.date, filters.to))
  if (filters.search) {
    conditions.push(ilike(movement.description, `%${escapeLike(filters.search)}%`))
  }
  return conditions
}

/**
 * El orden de las dos listas. El `id` al final no lo pide ninguna pantalla: es
 * el desempate que hace determinista al LIMIT/OFFSET de `listMovementsPage`.
 * Sin él, dos movimientos del mismo día cargados en la misma transacción
 * comparten `(date, created_at)` y Postgres puede devolverlos en distinto orden
 * en cada consulta — o sea, la misma fila en dos páginas y otra en ninguna.
 */
const MOVEMENT_ORDER = [desc(movement.date), desc(movement.createdAt), desc(movement.id)]

/** Le cuelga a cada movimiento sus cuotas, ordenadas por número. */
async function conCuotas(
  tx: Tx,
  movements: Movement[],
): Promise<MovementWithInstallments[]> {
  if (movements.length === 0) return []

  const installments = await tx
    .select()
    .from(installment)
    .where(
      inArray(
        installment.movementId,
        movements.map((m) => m.id),
      ),
    )
    .orderBy(asc(installment.number))

  const byMovement = new Map<string, Installment[]>()
  for (const row of installments) {
    const list = byMovement.get(row.movementId) ?? []
    list.push(row)
    byMovement.set(row.movementId, list)
  }

  return movements.map((m) => ({ ...m, installments: byMovement.get(m.id) ?? [] }))
}

/**
 * Los movimientos que pasan el filtro, con las cuotas colgadas. Sin tope: el único llamador que queda es
 * la lista filtrada por estado, que no puede recortar en SQL (ver
 * `listMovementsPage`).
 */
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

    return conCuotas(tx, movements)
  })
}

/**
 * Una página de movimientos, recortada por la base y no en memoria.
 *
 * Es la consulta de /ingresos y /egresos cuando NO hay filtro de estado, que es
 * la vista con la que se entra a las dos pantallas. `listMovements` traía cada
 * movimiento que matchea el WHERE más todas sus cuotas para mostrar veinte: con
 * 5.000 movimientos son 5.000 filas y sus cuotas por carga. Acá el `count(*)`
 * lo resuelve el índice y el SELECT trae exactamente las veinte filas de la
 * página, así que el costo deja de crecer con el historial.
 *
 * NO sirve para el filtro de estado: el estado no es una columna, se deriva de
 * las cuotas (`getMovementStatus`), y un LIMIT en SQL no sabe cuántas filas van
 * a sobrevivir a un filtro que se aplica después. Esa rama sigue trayendo todo
 * y cortando en memoria con `paginate`.
 *
 * El clamp de la página es el mismo criterio que `paginate` (@/lib/movement-query):
 * pedir una página que ya no existe —pasa siempre que un filtro achica la lista
 * con el `?page=` viejo en la URL— devuelve la última, no una tabla en blanco.
 */
export async function listMovementsPage(
  userId: string,
  filters: MovementFilters,
  page: number,
): Promise<Page<MovementWithInstallments>> {
  return withUser(userId, async (tx) => {
    const conditions = movementConditions(userId, filters)

    const [total] = await tx
      .select({ value: count() })
      .from(movement)
      .where(and(...conditions))

    const totalPages = Math.max(1, Math.ceil((total?.value ?? 0) / PAGE_SIZE))
    const current = Math.min(Math.max(1, page), totalPages)

    const movements = await tx
      .select()
      .from(movement)
      .where(and(...conditions))
      .orderBy(...MOVEMENT_ORDER)
      .limit(PAGE_SIZE)
      .offset((current - 1) * PAGE_SIZE)

    return { items: await conCuotas(tx, movements), page: current, totalPages }
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
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
      .where(and(eq(installment.userId, userId), eq(installment.paid, true)))

    // El filtro `paid = true` ya está arriba: acá es donde vive el saber que
    // convierte `paidDate` de `string | null` a `IsoDate`.
    return rows.map((r) => ({ ...r, paidDate: assertPaidDate(r.paidDate) }))
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
      })
      .from(installment)
      .innerJoin(movement, eq(installment.movementId, movement.id))
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
      .where(
        and(
          eq(installment.userId, userId),
          eq(installment.paid, true),
          eq(movement.currency, "USD"),
          gte(installment.paidDate, settings.date),
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
