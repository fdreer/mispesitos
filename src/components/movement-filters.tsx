"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { buildMovementHref, type MovementQuery } from "@/lib/movement-query"
import type { MovementStatus } from "@/lib/movement-status"
import type { Category } from "@/server/queries"

const STATUS_OPTIONS: { value: MovementStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendiente" },
  { value: "paid", label: "Pagado" },
  { value: "overdue", label: "Vencido" },
]

/** Cuánto se espera a que la persona deje de tipear antes de navegar. */
const DEBOUNCE_MS = 400

type Props = {
  /** Ruta de la pantalla actual ("/ingresos" o "/egresos"), sin query. */
  basePath: string
  query: MovementQuery
  /**
   * Incluye las archivadas a propósito: un movimiento viejo puede apuntar a
   * una categoría ya archivada y tiene que poder filtrarse por ella igual.
   */
  categories: Category[]
}

/**
 * Los filtros viven en la URL, no en estado local: sobreviven a una recarga,
 * se pueden compartir, y el dashboard puede enlazar directo a la lista ya
 * filtrada (`?status=`, ver dashboard/upcoming.tsx).
 */
export function MovementFilters({ basePath, query, categories }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState(query.search)

  // El buscador navega solo, con espera: una navegación por tecla tipeada es
  // una consulta a la base por tecla. Los otros filtros cambian de a un click
  // y navegan directo.
  //
  // ponytail: el texto tipeado no se resincroniza si se vuelve con el botón
  // Atrás. Sincronizarlo pisa lo que se está tipeando mientras la navegación
  // anterior viaja, que es el caso frecuente; esto es el raro.
  useEffect(() => {
    if (search === query.search) return
    const id = setTimeout(() => {
      router.push(buildMovementHref(basePath, query, { search }))
    }, DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search, query, basePath, router])

  function go(patch: Partial<MovementQuery>) {
    router.push(buildMovementHref(basePath, query, patch))
  }

  const hayFiltros =
    query.search !== "" ||
    query.categoryId !== "all" ||
    query.status !== "all" ||
    query.from !== "" ||
    query.to !== ""

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="search">Buscar</Label>
        <Input
          id="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Descripción"
          maxLength={200}
        />
      </div>

      <div className="min-w-40 space-y-1">
        <Label htmlFor="categoryId">Categoría</Label>
        <Select value={query.categoryId} onValueChange={(v) => go({ categoryId: v })}>
          <SelectTrigger id="categoryId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-36 space-y-1">
        <Label htmlFor="status">Estado</Label>
        <Select
          value={query.status}
          onValueChange={(v) => go({ status: v as MovementStatus | "all" })}
        >
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="from">Desde</Label>
        <Input id="from" type="date" value={query.from} onChange={(e) => go({ from: e.target.value })} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="to">Hasta</Label>
        <Input id="to" type="date" value={query.to} onChange={(e) => go({ to: e.target.value })} />
      </div>

      {hayFiltros && (
        <Button type="button" variant="ghost" onClick={() => router.push(basePath)}>
          Limpiar
        </Button>
      )}
    </div>
  )
}
