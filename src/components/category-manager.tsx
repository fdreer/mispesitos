"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
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

  // La lista llega ordenada por nombre desde la consulta; separarlas mantiene
  // ese orden adentro de cada grupo.
  const activas = categories.filter((c) => !c.archived)
  const archivadas = categories.filter((c) => c.archived)

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
        <Button type="submit" variant="outline" disabled={pending}>
          Agregar
        </Button>
      </form>

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      {/*
       * Las archivadas se muestran acá abajo, atenuadas y con su etiqueta, en
       * vez de desaparecer: eran invisibles desde toda la interfaz, así que la
       * única señal de que archivar había funcionado era que la fila se
       * esfumaba, y no había forma de saber qué categorías existían de antes.
       * Siguen sin ofrecerse al cargar un movimiento —para eso se archivan— y
       * por eso tampoco llevan el botón de archivar, que ya no aplica.
       */}
      <ul className="divide-y">
        {activas.map((c) => (
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

        {activas.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">
            No tenés categorías activas de este tipo.
          </li>
        )}

        {archivadas.map((c) => (
          <li
            key={c.id}
            className="text-muted-foreground flex items-center justify-between py-2"
          >
            <span>{c.name}</span>
            <Badge variant="outline">Archivada</Badge>
          </li>
        ))}
      </ul>

      {archivadas.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Las archivadas no aparecen al cargar un movimiento, pero los movimientos que ya las
          usaban las siguen mostrando.
        </p>
      )}
    </section>
  )
}
