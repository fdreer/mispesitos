import "server-only"

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm"

import { withUser } from "@/db/client"
import { category, installment, movement, userSettings } from "@/db/schema"

export type Settings = typeof userSettings.$inferSelect

export async function getSettings(userId: string): Promise<Settings | null> {
  const rows = await withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  )
  return rows[0] ?? null
}

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
  return withUser(userId, (tx) =>
    tx
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
      .where(and(eq(installment.userId, userId), eq(installment.paid, true))),
  )
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

/** Todos los cambios de divisa, para saldo y posición. */
export async function listExchanges(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select()
      .from(movement)
      .where(and(eq(movement.userId, userId), eq(movement.kind, "exchange")))
      .orderBy(asc(movement.date)),
  )
}
