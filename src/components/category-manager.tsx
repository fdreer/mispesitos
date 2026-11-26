"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { CategoryBadge } from "@/components/category-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  archiveCategory,
  createCategory,
  unarchiveCategory,
} from "@/server/actions/categories"
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
  // El error del último intento de archivar o desarchivar, con la fila donde
  // pasó: los dos caminos usan el mismo estado porque nunca hay dos en vuelo
  // (`archiving` deshabilita todos los botones mientras uno viaja).
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  useEffect(() => {
    if (state?.ok) {
      router.refresh()
      toast.success("Categoría creada")
    }
  }, [state, router])

  // La lista llega ordenada por nombre desde la consulta; separarlas mantiene
  // ese orden adentro de cada grupo.
  const activas = categories.filter((c) => !c.archived)
  const archivadas = categories.filter((c) => c.archived)

  // Mismo patrón que DeleteMovementButton/InstallmentRows: la Server Action
  // devuelve un ActionResult que hay que mirar, nunca descartar con `void` —
  // si archivar falla, el usuario tiene que enterarse en vez de ver la
  // categoría seguir ahí sin explicación. Vale igual para desarchivar, que
  // además tiene un modo de falla propio (el nombre chocado, ver
  // `unarchiveCategory`).
  function handleArchivedToggle(id: string, archived: boolean) {
    setRowError(null)
    startTransition(async () => {
      const result = archived ? await unarchiveCategory(id) : await archiveCategory(id)
      if (!result.ok) {
        setRowError({ id, message: result.message })
      } else {
        toast.success(archived ? "Categoría desarchivada" : "Categoría archivada")
      }
    })
  }

  return (
    // La misma tarjeta que agrupa los bloques del dashboard y de /cambios.
    // Antes eran dos <section> sueltas separadas sólo por aire: nada decía
    // dónde terminaba la lista de ingresos y empezaba la de egresos, y la
    // única pista era que el h2 de la segunda estaba más abajo.
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">
          {kind === "income" ? "De ingresos" : "De egresos"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Acotado: el campo es para un nombre de categoría, no para un
            párrafo. Sin tope, el Input (que es `w-full`) se estiraba a todo
            el ancho de la tarjeta. */}
        <form action={action} className="flex max-w-sm gap-2">
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
       * Siguen sin ofrecerse al cargar un movimiento —para eso se archivan—,
       * pero desde acá se pueden volver a activar: archivar era irreversible
       * desde la interfaz y la única salida era crear otra con el mismo nombre,
       * que dejaba dos filas donde tenía que haber una.
       */}
        {/* El mismo badge de color que la categoría tiene en la tabla de
            movimientos y en el filtro: esta pantalla es donde se la crea, así
            que es donde primero hay que poder asociar nombre y color. */}
        <ul className="divide-y">
          {activas.map((c) => (
            <li key={c.id} className="flex min-h-9 items-center justify-between gap-2 py-1.5">
              <CategoryBadge name={c.name} />
              <span className="flex flex-col items-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={archiving}
                  onClick={() => handleArchivedToggle(c.id, false)}
                >
                  Archivar
                </Button>
                {rowError?.id === c.id && (
                  <p className="text-destructive text-xs">{rowError.message}</p>
                )}
              </span>
            </li>
          ))}

          {activas.length === 0 && (
            <li className="text-muted-foreground py-2 text-sm">
              No tenés categorías activas de este tipo.
            </li>
          )}

          {/* Atenuadas por opacidad y no por `text-muted-foreground`: el color
              del badge viene por `style`, que le gana a cualquier clase de
              color. */}
          {archivadas.map((c) => (
            <li key={c.id} className="flex min-h-9 items-center justify-between gap-2 py-1.5">
              <CategoryBadge name={c.name} className="opacity-50" />
              <span className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-2">
                  <Badge variant="outline">Archivada</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={archiving}
                    onClick={() => handleArchivedToggle(c.id, true)}
                  >
                    Desarchivar
                  </Button>
                </span>
                {rowError?.id === c.id && (
                  <p className="text-destructive text-xs">{rowError.message}</p>
                )}
              </span>
            </li>
          ))}
        </ul>

        {archivadas.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Las archivadas no aparecen al cargar un movimiento, pero los movimientos que ya las
            usaban las siguen mostrando.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
