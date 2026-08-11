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
  // Se saca `push` del objeto en vez de usar `router` entero: el objeto que
  // devuelve `useRouter()` se re-memoiza en cada navegación, pero `push` en sí
  // es un singleton estable en Next 16 — por eso desestructurarlo alcanza para
  // tener siempre la función vigente sin acarrear el objeto que la contiene.
  const { push } = useRouter()
  const [search, setSearch] = useState(query.search)
  const [pending, startTransition] = useTransition()
  // Vive en un ref: `go()`, `limpiar()` y el propio debounce necesitan poder
  // cancelarlo o reprogramarlo entre renders sin disparar uno nuevo (un
  // estado sí lo haría).
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Se actualiza después de cada render (React no deja escribir un ref
  // DURANTE el render) para que cuando el timeout de más abajo dispare
  // —potencialmente varios renders después de haberse armado— lea el `query`
  // vigente en ESE momento, no el que estaba cerrado cuando se programó. Este
  // efecto no programa nada ni navega: sólo deja una copia al día, así que no
  // reabre la carrera que se elimina más abajo.
  const queryRef = useRef(query)
  useEffect(() => {
    queryRef.current = query
  })

  // El buscador navega solo, con espera: una navegación por tecla tipeada es
  // una consulta a la base por tecla. Los otros filtros cambian de a un click
  // y navegan directo. El timeout se arma acá, en el propio `onChange`, y no
  // en un efecto: así sólo lo arma una tecla real, nunca un cambio de estado
  // que el componente se provocó a sí mismo (que era la causa de fondo de la
  // carrera anterior).
  //
  // ponytail: `search` sólo se inicializa desde `query.search` al montar y no
  // se resincroniza después. Si la URL cambia desde afuera sin desmontar el
  // componente (típicamente el botón Atrás), el input se queda mostrando el
  // texto tipeado aunque `query.search` ya sea otro. Es sólo visual: el
  // timeout de acá abajo lee `queryRef.current` al disparar, así que ninguna
  // navegación sale con datos viejos por esto.
  function handleSearchChange(value: string) {
    setSearch(value)
    // Cancela el debounce anterior: si no, dos teclas seguidas arman dos
    // timeouts y navegan dos veces.
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      startTransition(() => {
        push(buildMovementHref(basePath, queryRef.current, { search: value }))
      })
    }, DEBOUNCE_MS)
  }

  function go(patch: Partial<MovementQuery>) {
    // Cancela el debounce del buscador si todavía estaba armado: si no,
    // puede disparar después de este push y agregar `search` a una URL que
    // la persona ya cambió con otro filtro, pisándolo.
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
          onChange={(e) => handleSearchChange(e.target.value)}
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
