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
import {
  SEARCH_MAX,
  STATUS_VALUES,
  buildMovementHref,
  hayFiltrosActivos,
  parseMovementQuery,
  type MovementQuery,
} from "@/lib/movement-query"
import type { MovementStatus } from "@/lib/movement-status"
import type { Category } from "@/server/queries"

/** Las etiquetas quedan acá; el conjunto de valores viene de STATUS_VALUES
 * (movement-query.ts) para que el desplegable no pueda ofrecer un estado que
 * el parser no entiende — ver finding 4 de la auditoría. */
const STATUS_LABELS: Record<MovementStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  overdue: "Vencido",
}

const STATUS_OPTIONS: { value: MovementStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  ...STATUS_VALUES.map((value) => ({ value, label: STATUS_LABELS[value] })),
]

/** Cuánto se espera a que la persona deje de tipear antes de navegar. */
const DEBOUNCE_MS = 400

/**
 * Reconstruye la query que representa un href ya armado por
 * `buildMovementHref`. Se usa para actualizar `queryRef` después de cada
 * `push`: en vez de reimplementar acá dónde vive cada default o cuándo se
 * resetea la página (reglas que ya son de `buildMovementHref`), se las pide
 * de vuelta a `parseMovementQuery` sobre el mismo string que se está por
 * empujar — así el href que se navega y la query que queda guardada nunca
 * pueden desalinearse entre sí.
 */
function hrefToQuery(href: string): MovementQuery {
  const qs = href.split("?")[1] ?? ""
  return parseMovementQuery(Object.fromEntries(new URLSearchParams(qs)))
}

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
  // Guarda la ÚLTIMA query que efectivamente se empujó con `push`, no la que
  // llegó por props: la prop se queda mostrando el valor viejo hasta que el
  // viaje al servidor commitea, así que si `go()` o el debounce armaran el
  // próximo href desde la prop, un segundo cambio de filtro disparado antes
  // de ese commit pisaría al primero en vez de sumarse (finding 1 de la
  // auditoría). `go()`, `handleSearchChange()` y `limpiar()` la actualizan
  // cada vez que empujan.
  //
  // El efecto de acá abajo la vuelve a poner en sync con la prop, pero sólo
  // cuando la prop CAMBIA (dependencia `[query]`, no "después de cada
  // render"): así vuelve a reflejar la realidad en cuanto el server manda
  // props frescas, sea por el commit de una navegación propia, el botón
  // Atrás o un link externo (el `?status=` del dashboard). Si en cambio
  // corriera en cada render, el propio cambio de `pending` que dispara
  // `useTransition` —que pasa ANTES de que la navegación commitee y con la
  // prop todavía vieja— pisaría el valor recién empujado con esa prop vieja,
  // reabriendo el mismo bug.
  const queryRef = useRef(query)
  useEffect(() => {
    queryRef.current = query
  }, [query])
  // El timeout del debounce es un setTimeout de JS puro: React no sabe que
  // existe, así que si el componente se desmonta antes de que dispare, nadie
  // lo cancela y termina navegando desde una pantalla que ya no está.
  useEffect(() => () => clearTimeout(searchTimeout.current), [])

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
      const href = buildMovementHref(basePath, queryRef.current, { search: value })
      // Se guarda ANTES del push (no importa el orden real, pero así queda
      // junto a la construcción del mismo href): ver el comentario de
      // `queryRef` más arriba.
      queryRef.current = hrefToQuery(href)
      startTransition(() => {
        push(href)
      })
    }, DEBOUNCE_MS)
  }

  function go(patch: Partial<MovementQuery>) {
    // Cancela el debounce del buscador si todavía estaba armado: si no,
    // puede disparar después de este push y agregar `search` a una URL que
    // la persona ya cambió con otro filtro, pisándolo.
    clearTimeout(searchTimeout.current)
    // Parte de `queryRef.current`, no de la prop `query`: ver el comentario
    // de `queryRef` más arriba (finding 1 de la auditoría).
    const href = buildMovementHref(basePath, queryRef.current, patch)
    queryRef.current = hrefToQuery(href)
    startTransition(() => {
      push(href)
    })
  }

  function limpiar() {
    // Mismo motivo que en `go()`: sin cancelar, el debounce puede disparar
    // después y resucitar los filtros viejos que "Limpiar" acaba de borrar.
    clearTimeout(searchTimeout.current)
    setSearch("")
    // También hay que dejarla en sync acá: si no, un filtro elegido justo
    // después de "Limpiar" (todavía sin commitear) compondría sobre los
    // filtros que se acaban de borrar en vez de partir de cero.
    queryRef.current = hrefToQuery(basePath)
    startTransition(() => {
      push(basePath)
    })
  }

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
        <Label htmlFor="filtro-buscar">Buscar</Label>
        <Input
          id="filtro-buscar"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Descripción"
          maxLength={SEARCH_MAX}
        />
      </div>

      <div className="min-w-40 space-y-1">
        <Label htmlFor="filtro-categoria">Categoría</Label>
        <Select value={query.categoryId} onValueChange={(v) => go({ categoryId: v })}>
          <SelectTrigger id="filtro-categoria" className="w-full">
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
        <Label htmlFor="filtro-estado">Estado</Label>
        <Select
          value={query.status}
          onValueChange={(v) => go({ status: v as MovementStatus | "all" })}
        >
          <SelectTrigger id="filtro-estado" className="w-full">
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
        <Label htmlFor="filtro-desde">Desde</Label>
        <Input
          id="filtro-desde"
          type="date"
          value={query.from}
          onChange={(e) => go({ from: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="filtro-hasta">Hasta</Label>
        <Input
          id="filtro-hasta"
          type="date"
          value={query.to}
          onChange={(e) => go({ to: e.target.value })}
        />
      </div>

      {hayFiltrosActivos(query) && (
        <Button type="button" variant="ghost" onClick={limpiar}>
          Limpiar
        </Button>
      )}
    </div>
  )
}
