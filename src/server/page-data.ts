import "server-only"

import { withUser } from "@/db/client"
import type { IsoDate } from "@/lib/dates"
import {
  selectCard,
  selectCards,
  selectStatementInstallments,
  selectStatementSummaries,
  selectUnpaidCardInstallments,
} from "@/server/card-queries"
import {
  balanceStart,
  selectBalances,
  selectCategories,
  selectPaidInstallments,
  selectPendingInstallments,
  type Settings,
} from "@/server/queries"

/*
 * Lecturas agrupadas por pantalla: UNA transacción `withUser` por página en
 * vez de una por consulta. Cada `withUser` cuesta una conexión del pool y
 * cuatro idas y vueltas (BEGIN, claims, rol, COMMIT); con seis en paralelo,
 * dos usuarios a la vez ya agotaban un pool de diez. Adentro de la
 * transacción las consultas salen juntas: postgres.js las encola en la misma
 * conexión (pipelining) sin esperar cada respuesta.
 */

/** Todo lo que el dashboard lee de la base. */
export async function getDashboardData(
  userId: string,
  settings: Settings,
  today: IsoDate,
  historyFrom: IsoDate,
) {
  return withUser(userId, async (tx) => {
    const [balances, paid, pending, expenseCategories, unpaidStatements] = await Promise.all([
      selectBalances(tx, userId, balanceStart(settings), today),
      selectPaidInstallments(tx, userId, { from: historyFrom }),
      selectPendingInstallments(tx, userId),
      selectCategories(tx, userId, "expense", true),
      selectStatementSummaries(tx, userId, { onlyUnpaid: true }),
    ])
    return { balances, paid, pending, expenseCategories, unpaidStatements }
  })
}

/** El informe de flujo: el saldo de hoy y lo pendiente. */
export async function getCashflowData(userId: string, settings: Settings, today: IsoDate) {
  return withUser(userId, async (tx) => {
    const [balances, pending] = await Promise.all([
      selectBalances(tx, userId, balanceStart(settings), today),
      selectPendingInstallments(tx, userId),
    ])
    return { balances, pending }
  })
}

/** /tarjetas: las tarjetas, sus resúmenes y lo que deben. */
export async function getCardsOverviewData(userId: string) {
  return withUser(userId, async (tx) => {
    const [cards, statements, unpaid] = await Promise.all([
      selectCards(tx, userId, true),
      selectStatementSummaries(tx, userId),
      selectUnpaidCardInstallments(tx, userId),
    ])
    return { cards, statements, unpaid }
  })
}

/**
 * /tarjetas/[cardId], primer nivel: la tarjeta y todo lo que no depende del
 * resumen elegido, en paralelo (antes la tarjeta iba sola primero).
 */
export async function getCardDetailData(userId: string, cardId: string) {
  return withUser(userId, async (tx) => {
    const [card, statements, categories, unpaid] = await Promise.all([
      selectCard(tx, userId, cardId),
      selectStatementSummaries(tx, userId, { cardId }),
      selectCategories(tx, userId, "expense", true),
      selectUnpaidCardInstallments(tx, userId, cardId),
    ])
    return { card, statements, categories, unpaid }
  })
}

/**
 * /tarjetas/[cardId], segundo nivel: las compras del resumen elegido y, si
 * tiene dólares por pagar, el saldo en dólares para ofrecer pagarlos con eso.
 */
export async function getStatementDetailData(
  userId: string,
  settings: Settings,
  today: IsoDate,
  statementId: string | null,
  needsUsdBalance: boolean,
) {
  if (statementId === null && !needsUsdBalance) {
    return { installments: [], usdBalanceCents: 0 }
  }
  return withUser(userId, async (tx) => {
    const [installments, balances] = await Promise.all([
      statementId ? selectStatementInstallments(tx, userId, statementId) : Promise.resolve([]),
      needsUsdBalance
        ? selectBalances(tx, userId, balanceStart(settings), today)
        : Promise.resolve(null),
    ])
    return { installments, usdBalanceCents: balances?.usdCents ?? 0 }
  })
}
