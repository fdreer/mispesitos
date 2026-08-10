import { CategoryManager } from "@/components/category-manager"
import { listCategories } from "@/server/queries"
import { requireSettings } from "@/server/session"

export default async function CategoriasPage() {
  const { user } = await requireSettings()
  // Con las archivadas incluidas: ésta es la pantalla para la que existe el
  // tercer parámetro de listCategories. Sin él, archivar hacía desaparecer la
  // fila y la categoría no volvía a verse desde ningún lado.
  const categories = await listCategories(user.id, undefined, true)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-paper">Categorías</h1>
      <CategoryManager kind="income" categories={categories.filter((c) => c.kind === "income")} />
      <CategoryManager kind="expense" categories={categories.filter((c) => c.kind === "expense")} />
    </div>
  )
}
