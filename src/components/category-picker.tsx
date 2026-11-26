"use client"

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
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
 * El panel se despliega EN EL LUGAR, debajo del botón, y no en un Popover. El
 * formulario vive adentro de un Dialog de Radix, que bloquea el scroll de todo
 * lo que esté fuera de su contenido: un Popover se portea al `body`, o sea
 * afuera, y su lista no se podía scrollear con la rueda. Además, React propaga
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
          "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm",
          indented && "pl-5",
          index === active && "bg-accent",
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

  return (
    <div className="space-y-1.5">
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
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "data-invalid:border-destructive",
        )}
      >
        {selected ? (
          <CategoryBadge {...selected} />
        ) : (
          <span className="text-muted-foreground">Elegí una categoría</span>
        )}
        <ChevronDown aria-hidden className="size-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="rounded-md border border-border bg-popover p-1.5 shadow-md">
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
              className="h-10 pl-8"
            />
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label="Categorías"
            className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto"
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
