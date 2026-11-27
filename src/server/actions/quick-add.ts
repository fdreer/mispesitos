"use server"

import { todayInAr } from "@/lib/dates"
import type { QuickAddData } from "@/components/quick-add-sheet"
import { getQuickAddCatalogs } from "@/server/card-queries"
import { requireUser } from "@/server/session"

/**
 * Los catálogos del alta rápida móvil (categorías, tarjetas y sugerencias),
 * pedidos al abrir la hoja. Antes los cargaba el layout en cada navegación y
 * en cada mutación, también en escritorio, donde la hoja ni se abre.
 */
export async function loadQuickAddData(): Promise<QuickAddData> {
  const user = await requireUser()
  const today = todayInAr()
  const catalogs = await getQuickAddCatalogs(user.id, today)
  return { ...catalogs, today }
}
