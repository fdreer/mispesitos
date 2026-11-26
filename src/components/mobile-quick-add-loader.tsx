import { QuickAddSheet } from "@/components/quick-add-sheet"
import { todayInAr } from "@/lib/dates"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { getQuickAddCatalogs } from "@/server/card-queries"
import { requireSettings } from "@/server/session"

export async function MobileQuickAddLoader() {
  const { user, settings } = await requireSettings()
  const today = todayInAr()

  const [catalogs, rate] = await Promise.all([
    getQuickAddCatalogs(user.id, today),
    fetchSuggestedRate(settings.preferredRate as RatePreference),
  ])

  return (
    <QuickAddSheet
      expenseCategories={catalogs.expenseCategories}
      incomeCategories={catalogs.incomeCategories}
      cards={catalogs.cards}
      expenseSuggestions={catalogs.expenseSuggestions}
      incomeSuggestions={catalogs.incomeSuggestions}
      suggestedRate={rate?.referenceRate ?? null}
      today={today}
    />
  )
}
