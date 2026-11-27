"use client"

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { Input } from "@/components/ui/input"
import { categoryIcon } from "@/lib/category-icons"
import {
  categoryLabels,
  flattenSelectorGroups,
  selectorGroups,
  type TreeCategory,
} from "@/lib/category-tree"
import { cn } from "@/lib/utils"

type PickerCategory = TreeCategory & { icon: string | null }

const lastKey = (kind: "income" | "expense") => `mis-pesitos:ultima-categoria:${kind}`

/** Alto de la lista: el cómodo, y el mínimo antes de preferir scrollear. */
const LIST_MAX = 240
const LIST_MIN = 140
/** Lo que ocupa el panel además de la lista: el buscador y los márgenes. */
const PANEL_CHROME = 60
const PANEL_GAP = 6
/** Con este lugar abajo no se considera abrir hacia arriba. */
const PANEL_COMFORT = LIST_MAX + PANEL_CHROME
/** Margen contra los bordes de la ventana cuando el panel desborda el modal. */
const VIEWPORT_MARGIN = 8
/** Ancho mínimo del panel: la columna de Categoría es angosta. */
const PANEL_MIN_WIDTH = 288

type Placement = {
  up: boolean
  listMax: number
  /** Sólo dentro de un diálogo: la posición relativa a su contenedor. */
  style?: CSSProperties
}

/**
 * Lo visible alrededor del selector: el primer ancestro que scrollea (el
 * cuerpo del modal), o la ventana si no hay ninguno.
 */
function visibleBox(el: HTMLElement): { top: number; bottom: number } {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") {
      const r = node.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    }
  }
  return { top: 0, bottom: window.innerHeight }
}

/**
 * "Recuerda la última usada" (§2.3 del plan v2). En el navegador y no en la
 * base: es una comodidad de este dispositivo, no un dato de la persona, y no
 * vale una columna ni una escritura más por cada movimiento.
 *
 * Todo envuelto en try/catch: en una ventana privada, o con el almacenamiento
 * bloqueado, `localStorage` tira al leerlo. Sin recordar, el formulario
 * arranca en la primera opción, que es lo que hacía antes.
 */
export function readLastCategory(kind: "income" | "expense"): string | null {
  try {
    return window.localStorage.getItem(lastKey(kind))
  } catch {
    return null
  }
}

export function rememberCategory(kind: "income" | "expense", id: string): void {
  try {
    window.localStorage.setItem(lastKey(kind), id)
  } catch {
    // Sin almacenamiento no hay nada que recordar; no es un error para nadie.
  }
}

/**
 * La categoría con la que arranca el formulario de alta: la última usada si
 * todavía se puede elegir (puede haberse archivado, o haber recibido
 * subcategorías y dejado de ser hoja), si no la primera opción.
 */
export function initialCategoryId(
  categories: PickerCategory[],
  last: string | null,
): string {
  const options = flattenSelectorGroups(selectorGroups(categories))
  if (last && options.some((c) => c.id === last)) return last
  return options[0]?.id ?? ""
}

/**
 * El selector de categoría del formulario de movimientos (§2.3 del plan v2):
 * un combobox con búsqueda, agrupado por padre, donde los padres con hijas son
 * encabezados y no opciones (decisión 7.4: un movimiento va siempre a una
 * hoja).
 *
 * El panel vive EN EL ÁRBOL del formulario, debajo del botón, y no en un
 * Popover. El formulario vive adentro de un Dialog de Radix, que bloquea el
 * scroll de todo lo que esté fuera de su contenido: un Popover se portea al
 * `body`, o sea afuera, y su lista no se podía scrollear con la rueda. Flota
 * (`absolute`) sobre los campos de abajo en vez de empujarlos: abrirlo no
 * estira el modal ni corre el resto del formulario. Además, React propaga
 * los eventos a través de los portales (ver `movement-list.tsx`): con el panel
 * adentro del árbol del formulario no hay nada nuevo que cuide la fila de la
 * tabla de la que cuelga el diálogo de edición.
 *
 * Accesibilidad: el patrón combobox de ARIA 1.2. El campo de búsqueda es el
 * `combobox`, la lista es un `listbox` con `group`s, y la opción activa se
 * anuncia con `aria-activedescendant`: el foco se queda en el campo mientras
 * las flechas recorren la lista.
 */
export function CategoryPicker({
  id,
  name,
  categories,
  value,
  onChange,
  invalid,
  label = "Categoría",
}: {
  id: string
  name: string
  categories: PickerCategory[]
  value: string
  onChange: (id: string) => void
  invalid?: boolean
  /**
   * El nombre del campo, para armar el `aria-label` del botón CON el valor
   * adentro. Mismo hallazgo que `DateField` en movement-form.tsx: un
   * `<label htmlFor>` que apunta al botón le gana al contenido en el nombre
   * accesible, y el lector de pantalla decía "Categoría" sin decir cuál.
   */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Dónde abre el panel y cuánto alto le queda a la lista: se mide al abrir.
  const [placement, setPlacement] = useState<Placement>({ up: false, listMax: LIST_MAX })
  // Dentro de un diálogo, el panel se cuelga de su contenedor y no del cuerpo
  // que scrollea: así puede asomar por debajo del modal en vez de quedar
  // recortado por él. Sigue siendo un descendiente del diálogo en el DOM, así
  // que el bloqueo de scroll de Radix deja usar la rueda sobre la lista.
  const [host, setHost] = useState<HTMLElement | null>(null)

  const labels = useMemo(() => categoryLabels(categories), [categories])
  // `keepId`: editando, la categoría del movimiento puede estar archivada y
  // tiene que seguir apareciendo, o guardar lo movería de categoría.
  const groups = useMemo(
    () => selectorGroups(categories, { keepId: value, query }),
    [categories, value, query],
  )
  const options = useMemo(() => flattenSelectorGroups(groups), [groups])
  const selected = labels.get(value)

  function openPanel() {
    setHost(triggerRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? null)
    setQuery("")
    // Arranca parado en la elegida, para que Enter sin moverse no la cambie.
    const all = flattenSelectorGroups(selectorGroups(categories, { keepId: value }))
    setActive(Math.max(0, all.findIndex((c) => c.id === value)))
    setOpen(true)
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(categoryId: string) {
    onChange(categoryId)
    close()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === "Enter") {
      // Sin esto, Enter en el buscador mandaba el formulario entero.
      event.preventDefault()
      const option = options[active]
      if (option) choose(option.id)
    } else if (event.key === "Escape") {
      // Adentro del Dialog no llega a correr: Radix escucha Escape en fase de
      // captura sobre el documento y cierra el diálogo primero. Queda para
      // cuando el selector se usa fuera de un diálogo.
      close()
    }
  }

  const optionId = (categoryId: string) => `${listId}-${categoryId}`
  const activeOption = options[active]

  // La opción activa siempre a la vista: al abrir (la elegida puede estar
  // abajo de todo, fuera de los 256px del panel) y al recorrer con las
  // flechas. `?.` porque jsdom no implementa scrollIntoView.
  const activeId = open && activeOption ? optionId(activeOption.id) : null
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" })
  }, [activeId])

  /*
   * Al abrir (y mientras esté abierto, si algo scrollea o cambia el tamaño):
   * hacia abajo, o hacia arriba si abajo no entra y arriba hay más lugar, con
   * la lista achicada para entrar. Abrirlo no corre nada.
   *
   * Dentro de un diálogo el límite es la ventana: el panel puede pasarse del
   * borde del modal. Fuera de uno, el límite es lo visible del primer
   * ancestro que scrollea; ahí hacia arriba sólo si entra entero (lo que
   * asoma por encima de un área que scrollea queda cortado sin forma de
   * llegar), y si ni achicado entra el área scrollea lo justo.
   */
  useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const el = triggerRef.current
      if (!el) return
      const trigger = el.getBoundingClientRect()
      const box = host
        ? { top: VIEWPORT_MARGIN, bottom: window.innerHeight - VIEWPORT_MARGIN }
        : visibleBox(el)
      const below = box.bottom - trigger.bottom - PANEL_GAP
      const above = trigger.top - box.top - PANEL_GAP
      const up =
        below < PANEL_COMFORT && above > below && (host !== null || above - PANEL_CHROME >= LIST_MIN)
      const room = (up ? above : below) - PANEL_CHROME
      const listMax = Math.max(LIST_MIN, Math.min(LIST_MAX, room))
      if (!host) {
        setPlacement({ up, listMax })
        return
      }
      const frame = host.getBoundingClientRect()
      setPlacement({
        up,
        listMax,
        style: {
          left: trigger.left - frame.left,
          width: Math.max(trigger.width, PANEL_MIN_WIDTH),
          ...(up
            ? { bottom: frame.bottom - trigger.top + PANEL_GAP }
            : { top: trigger.bottom - frame.top + PANEL_GAP }),
        },
      })
    }
    measure()
    if (!host) return
    // Captura: el scroll del cuerpo del modal no burbujea hasta `window`.
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)
    return () => {
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
    }
  }, [open, host])

  useEffect(() => {
    if (open && !host) panelRef.current?.scrollIntoView?.({ block: "nearest" })
  }, [open, host, placement])

  function renderOption(category: PickerCategory, indented: boolean) {
    const index = options.indexOf(category)
    const isSelected = category.id === value
    const Icon = categoryIcon(category.icon)
    return (
      <li
        key={category.id}
        id={optionId(category.id)}
        role="option"
        aria-selected={isSelected}
        className={cn(
          "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm",
          indented && "pl-5",
          index === active && "bg-white/[0.06]",
        )}
        // mousedown y no click: con click, el blur del buscador llega antes y
        // el panel se cierra sin elegir nada.
        onMouseDown={(e) => {
          e.preventDefault()
          choose(category.id)
        }}
        onMouseMove={() => setActive(index)}
      >
        {Icon ? (
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{category.name}</span>
        {isSelected && <Check aria-hidden className="size-4 shrink-0" />}
      </li>
    )
  }

  const portal = (node: ReactNode) => (host ? createPortal(node, host) : node)

  return (
    <div className="relative">
      {/* Lo que viaja en el FormData: el botón y el buscador son sólo la cara. */}
      <input type="hidden" name={name} value={value} />

      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-label={
          selected
            ? `${label}: ${selected.parentName ? `${selected.parentName} › ` : ""}${selected.name}`
            : `${label}: sin elegir`
        }
        aria-expanded={open}
        // `data-` y no `aria-invalid`: no es un atributo válido en un botón. El
        // error se lee igual, en el párrafo que el formulario pone debajo.
        data-invalid={invalid || undefined}
        onClick={() => (open ? close() : openPanel())}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent bg-white/[0.04] px-3 text-left text-sm outline-none transition-colors",
          "hover:bg-white/[0.06] aria-expanded:bg-white/[0.06]",
          "focus-visible:border-white/15 focus-visible:bg-white/[0.06]",
          "data-invalid:border-destructive/60",
        )}
      >
        {selected ? (
          <CategoryBadge {...selected} />
        ) : (
          <span className="text-muted-foreground">Elegí una categoría</span>
        )}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && portal(
        <div
          ref={panelRef}
          data-placement={placement.up ? "top" : "bottom"}
          style={placement.style}
          className={cn(
            "absolute z-50 rounded-xl border border-white/[0.08] bg-obsidian p-1.5 shadow-2xl shadow-black/60 animate-in fade-in-0 zoom-in-95 duration-100",
            !placement.style &&
              (placement.up ? "bottom-full left-0 mb-1.5 w-full min-w-72" : "top-full left-0 mt-1.5 w-full min-w-72"),
          )}
        >
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              role="combobox"
              aria-label="Buscar categoría"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeOption ? optionId(activeOption.id) : undefined}
              placeholder="Buscar…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              // Salir del panel lo cierra, salvo que el foco vaya al propio
              // botón: ahí es su clic el que lo cierra, y si lo cerrara también
              // el blur, el clic lo volvería a abrir.
              onBlur={(e) => {
                if (e.relatedTarget !== triggerRef.current) setOpen(false)
              }}
              className="h-9 border-transparent bg-white/[0.04] pl-8 focus-visible:border-white/15"
            />
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label="Categorías"
            style={{ maxHeight: placement.listMax }}
            className="mt-1.5 space-y-0.5 overflow-y-auto overscroll-contain"
          >
            {groups.map((group) =>
              group.type === "leaf" ? (
                renderOption(group.category, false)
              ) : (
                <li key={group.parent.id} role="presentation">
                  <ul role="group" aria-labelledby={`${listId}-g-${group.parent.id}`}>
                    <li
                      id={`${listId}-g-${group.parent.id}`}
                      role="presentation"
                      className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground"
                    >
                      {group.parent.name}
                    </li>
                    {group.options.map((c) => renderOption(c, true))}
                  </ul>
                </li>
              ),
            )}
            {options.length === 0 && (
              <li role="presentation" className="px-2 py-3 text-sm text-muted-foreground">
                Ninguna categoría coincide.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
