"use client"

import { useEffect, useRef, useState, useTransition } from "react"
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
import { cn } from "@/lib/utils"
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
  // Se saca `push` del objeto en vez de dejar `router` como dependencia: el
  // objeto que devuelve `useRouter()` es un `useMemo` que Next re-crea cada
  // vez que cambia el router de la app (o sea, en cada navegación nuestra),
  // aunque `push` en sí sea la misma función. Si el efecto de abajo dependiera
  // de `router` entero, una navegación de `go()` re-crearía ese objeto,
  // re-armaría el efecto del buscador aunque `search` no haya cambiado, y
  // reabriría exactamente la carrera del Finding 2.
  const { push } = useRouter()
  const [search, setSearch] = useState(query.search)
  const [pending, startTransition] = useTransition()
  // Vive en un ref, no solo en el cleanup del efecto: `go()` y `limpiar()`
  // necesitan poder cancelarlo desde afuera del efecto (ver Finding 2 más
  // abajo), y un ref sobrevive entre renders sin disparar uno nuevo.
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // El buscador navega solo, con espera: una navegación por tecla tipeada es
  // una consulta a la base por tecla. Los otros filtros cambian de a un click
  // y navegan directo.
  //
  // ponytail: el texto tipeado no se resincroniza si se vuelve con el botón
  // Atrás. Sincronizarlo pisa lo que se está tipeando mientras la navegación
  // anterior viaja, que es el caso frecuente; esto es el raro.
  useEffect(() => {
    if (search === query.search) return
    searchTimeout.current = setTimeout(() => {
      startTransition(() => {
        push(buildMovementHref(basePath, query, { search }))
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(searchTimeout.current)
  }, [search, query, basePath, push])

  function go(patch: Partial<MovementQuery>) {
    // Si el buscador todavía tenía el debounce armado, cancelarlo acá: si no,
    // dispara más tarde cerrado sobre el `query` de ANTES de este cambio (sin
    // `patch`) y pisa el filtro que la persona recién eligió.
    clearTimeout(searchTimeout.current)
    startTransition(() => {
      push(buildMovementHref(basePath, query, patch))
    })
  }

  function limpiar() {
    // Mismo motivo que en `go()`: sin cancelar, el debounce puede disparar
    // después y resucitar los filtros viejos que "Limpiar" acaba de borrar.
    clearTimeout(searchTimeout.current)
    setSearch("")
    startTransition(() => {
      push(basePath)
    })
  }

  const hayFiltros =
    query.search !== "" ||
    query.categoryId !== "all" ||
    query.status !== "all" ||
    query.from !== "" ||
    query.to !== ""

  return (
    // Los Select muestran el valor viejo hasta que llegan las props nuevas del
    // server (arquitectura 100% URL, sin estado optimista): atenuar mientras
    // `pending` está prendido es la señal de "esto ya está cargando", no un
    // intento de esconder el viaje.
    <div
      className={cn("flex flex-wrap items-end gap-3 transition-opacity", pending && "opacity-60")}
      aria-busy={pending}
    >
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
        <Button type="button" variant="ghost" onClick={limpiar}>
          Limpiar
        </Button>
      )}
    </div>
  )
}
