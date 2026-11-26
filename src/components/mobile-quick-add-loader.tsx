import { QuickAddSheet } from "@/components/quick-add-sheet"
import { todayInAr } from "@/lib/dates"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCardOptions, listDescriptionSuggestions } from "@/server/card-queries"
import { listCategories } from "@/server/queries"
import { requireSettings } from "@/server/session"

/**
 * Carga en segundo plano (dentro de un Suspense del layout) los catálogos que
 * necesita la hoja de carga rápida móvil ("+") sin frenar el render de la
 * pantalla principal.
 */
export async function MobileQuickAddLoader() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [expenseCategories, incomeCategories, cards, expenseSuggestions, incomeSuggestions, rate] =
    await Promise.all([
      listCategories(user.id, "expense", true),
      listCategories(user.id, "income", true),
      listCardOptions(user.id, today),
      listDescriptionSuggestions(user.id, "expense"),
      listDescriptionSuggestions(user.id, "income"),
      fetchSuggestedRate(settings.preferredRate as RatePreference),
    ])

  return (
    <QuickAddSheet
      expenseCategories={expenseCategories}
      incomeCategories={incomeCategories}
      cards={cards}
      expenseSuggestions={expenseSuggestions}
      incomeSuggestions={incomeSuggestions}
      suggestedRate={rate?.referenceRate ?? null}
      today={today}
    />
  )
}
