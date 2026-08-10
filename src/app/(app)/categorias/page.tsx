import { CategoryManager } from "@/components/category-manager"
import { listCategories } from "@/server/queries"
import { requireSettings } from "@/server/session"

export default async function CategoriasPage() {
  const { user } = await requireSettings()
  const categories = await listCategories(user.id)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Categorías</h1>
      <CategoryManager kind="income" categories={categories.filter((c) => c.kind === "income")} />
      <CategoryManager kind="expense" categories={categories.filter((c) => c.kind === "expense")} />
    </div>
  )
}
