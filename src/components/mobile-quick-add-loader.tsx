import { QuickAddSheet } from "@/components/quick-add-sheet"
import { todayInAr } from "@/lib/dates"
import { getQuickAddCatalogs } from "@/server/card-queries"
import { requireSettings } from "@/server/session"

export async function MobileQuickAddLoader() {
  const { user } = await requireSettings()
  const today = todayInAr()
  const catalogs = await getQuickAddCatalogs(user.id, today)

  return (
    <QuickAddSheet
      expenseCategories={catalogs.expenseCategories}
      incomeCategories={catalogs.incomeCategories}
      cards={catalogs.cards}
      expenseSuggestions={catalogs.expenseSuggestions}
      incomeSuggestions={catalogs.incomeSuggestions}
      today={today}
    />
  )
}
