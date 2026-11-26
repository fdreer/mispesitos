import { Suspense } from "react"

import { CategoryManager } from "@/components/category-manager"
import { countMovementsByCategory, listCategories } from "@/server/queries"
import { requireSettings } from "@/server/session"

async function CategoriasBody() {
  const { user } = await requireSettings()
  const [categories, counts] = await Promise.all([
    listCategories(user.id, undefined, true),
    countMovementsByCategory(user.id),
  ])
  const movementCounts = Object.fromEntries(counts)

  return (
    <>
      <CategoryManager
        kind="income"
        categories={categories.filter((c) => c.kind === "income")}
        movementCounts={movementCounts}
      />
      <CategoryManager
        kind="expense"
        categories={categories.filter((c) => c.kind === "expense")}
        movementCounts={movementCounts}
      />
    </>
  )
}

function CategoriasSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden
          className="h-[248px] animate-pulse rounded-xl border border-border"
        />
      ))}
    </>
  )
}

export default function CategoriasPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-paper">Categorías</h1>

      <div className="space-y-4">
        <Suspense fallback={<CategoriasSkeleton />}>
          <CategoriasBody />
        </Suspense>
      </div>
    </div>
  )
}
