import "server-only"

import { cache } from "react"

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm"

import { withUser } from "@/db/client"
import { category, installment, movement, userSettings } from "@/db/schema"
import {
  assertExchangeDirection,
  assertInstallmentMovementKind,
  assertPaidDate,
} from "@/lib/movement-asserts"
import { buildUsdPositionEvents, type PositionEvent } from "@/lib/position"

export type Settings = typeof userSettings.$inferSelect

/**
 * Memoizada por request, mismo motivo que `getOptionalUser` (@/server/session):
 * `requireSettings()` la llama desde el layout de (app) y otra vez desde cada
 * página, y cada llamada abre su propia transacción. Es la única consulta de la
 * app que se repite tal cual dentro del mismo request.
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
 */
export async function listCategories(
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
}

export type MovementFilters = {
  kind?: "income" | "expense" | "exchange"
  categoryId?: string
  currency?: "ARS" | "USD"
  from?: string
  to?: string
}

export async function listMovements(
  userId: string,
  filters: MovementFilters = {},
): Promise<MovementWithInstallments[]> {
  return withUser(userId, async (tx) => {
    const conditions = [eq(movement.userId, userId)]
    if (filters.kind) conditions.push(eq(movement.kind, filters.kind))
    if (filters.categoryId) conditions.push(eq(movement.categoryId, filters.categoryId))
    if (filters.currency) conditions.push(eq(movement.currency, filters.currency))
    if (filters.from) conditions.push(gte(movement.date, filters.from))
    if (filters.to) conditions.push(lte(movement.date, filters.to))

    const movements = await tx
      .select()
      .from(movement)
      .where(and(...conditions))
      .orderBy(desc(movement.date), desc(movement.createdAt))

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
 * Cambios de divisa, para saldo y posición.
 *
 * `from` es opcional y existe para /cambios: las tres tarjetas de esa pantalla
 * salen de `listUsdPositionEvents`, que corta en `initialBalanceDate`. Sin el
 * mismo corte en la lista, una operación anterior al saldo inicial se veía en
 * la lista sin mover ninguna de las tarjetas de arriba.
 *
 * El dashboard lo llama SIN `from` a propósito: `computeBalances` (@/lib/balance)
 * aplica su propio corte en memoria, y ese corte es el que está testeado.
 */
export async function listExchanges(userId: string, from?: string) {
  return withUser(userId, (tx) => {
    const conditions = [eq(movement.userId, userId), eq(movement.kind, "exchange")]
    if (from) conditions.push(gte(movement.date, from))

    return tx
      .select()
      .from(movement)
      .where(and(...conditions))
      .orderBy(asc(movement.date))
  })
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
  return withUser(userId, async (tx) => {
    const [settings] = await tx
      .select({
        usdCents: userSettings.initialBalanceUsdCents,
        rate: userSettings.initialBalanceUsdRate,
        date: userSettings.initialBalanceDate,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)

    // requireSettings() exige onboarding completo antes de llegar acá: en la
    // práctica esta fila siempre existe. Sin ella no hay saldo inicial que
    // sembrar ni piso de fecha que aplicar.
    if (!settings) return []

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
        // `paid_date` no puede ser nulo en una cuota pagada, y la consulta ya
        // filtró por `paid = true`: lo garantiza la CHECK
        // `installment_paid_date_required_when_paid` (migración 0009), no este `!`.
        // El `gte` de arriba ya descartaba esas filas en silencio; ahora
        // directamente no pueden existir.
        date: i.date!,
        usdCents: i.usdCents,
        rate: i.rate,
        kind: assertInstallmentMovementKind(i.kind),
      })),
    )
  })
}
