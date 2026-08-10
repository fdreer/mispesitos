"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { archiveCategory, createCategory } from "@/server/actions/categories"
import type { Category } from "@/server/queries"

export function CategoryManager({
  kind,
  categories,
}: {
  kind: "income" | "expense"
  categories: Category[]
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createCategory, null)
  const [archiving, startTransition] = useTransition()
  const [archiveError, setArchiveError] = useState<{ id: string; message: string } | null>(null)

  useEffect(() => {
    if (state?.ok) router.refresh()
  }, [state, router])

  // Mismo patrón que DeleteMovementButton/InstallmentRows: la Server Action
  // devuelve un ActionResult que hay que mirar, nunca descartar con `void` —
  // si archivar falla, el usuario tiene que enterarse en vez de ver la
  // categoría seguir ahí sin explicación.
  function handleArchive(id: string) {
    setArchiveError(null)
    startTransition(async () => {
      const result = await archiveCategory(id)
      if (!result.ok) {
        setArchiveError({ id, message: result.message })
      }
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium">{kind === "income" ? "De ingresos" : "De egresos"}</h2>

      <form action={action} className="flex gap-2">
        <input type="hidden" name="kind" value={kind} />
        <Input name="name" placeholder="Nombre de la categoría" required maxLength={60} />
        <Button type="submit" disabled={pending}>
          Agregar
        </Button>
      </form>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <ul className="divide-y">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span>{c.name}</span>
            <span className="flex flex-col items-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={archiving}
                onClick={() => handleArchive(c.id)}
              >
                Archivar
              </Button>
              {archiveError?.id === c.id && (
                <p className="text-destructive text-xs">{archiveError.message}</p>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
