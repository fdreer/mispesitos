# Filtros y paginación en ingresos/egresos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el filtro de estado de `/ingresos` y `/egresos` por una barra de filtros completa (descripción, categoría, estado, rango de fechas) y paginar la tabla de a 20 filas.

**Architecture:** Todo el estado de los filtros viaja en la URL, igual que hoy. Lo que es columna de la base (descripción, categoría, fechas) se filtra en SQL dentro de `listMovements`; el estado, que se deriva de las cuotas y no es columna, se sigue filtrando en memoria, y la paginación va después de ese filtro. Un módulo puro nuevo (`src/lib/movement-query.ts`) concentra el parseo del query string, el corte de página y la construcción de URLs, así que la parte con lógica se prueba en Node sin base ni DOM.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, Drizzle ORM sobre Postgres, shadcn/ui (`Input`, `Label`, `Select`, `Button`), Vitest (+ jsdom y `@testing-library/react` para el test de componente).

## Global Constraints

- **Cero dependencias nuevas y cero `shadcn add`.** El rango de fechas va con dos `Input type="date"` (patrón ya usado en `src/components/movement-form.tsx:141`), no con Popover + Calendar: `react-day-picker` no está instalado. La paginación va con `Button asChild` + `next/link`, mismo patrón que `src/components/status-filter.tsx`, porque el `pagination` de shadcn renderiza `<a>` y forzaría una recarga completa.
- **`PAGE_SIZE = 20`**, fijo, sin selector configurable.
- **`?status=` tiene que seguir funcionando tal cual está.** `src/components/dashboard/upcoming.tsx:43` enlaza a `${BASE_PATHS[item.kind]}?status=${item.status}`. Ese enlace no se toca y tiene que seguir cayendo en la lista filtrada.
- **Los comentarios y el copy van en español**, como el resto del repo. Comentar el *por qué*, no el *qué*.
- Comandos: `pnpm test` (unitarios, Node + jsdom), `pnpm test:db` (contra la base real, requiere `.env.local`), `pnpm typecheck`, `pnpm lint`.

---

### Task 1: Módulo puro de query, paginación y URLs

Todo lo que tiene lógica y no toca ni la base ni el DOM. Se hace primero porque las tres tareas siguientes lo consumen.

**Files:**
- Create: `src/lib/movement-query.ts`
- Test: `src/lib/movement-query.test.ts`

**Interfaces:**
- Consumes: `isValidIsoDate` de `@/lib/dates`, `MovementStatus` de `@/lib/movement-status`.
- Produces:
  - `PAGE_SIZE: 20`
  - `type MovementQuery = { search: string; categoryId: string; status: MovementStatus | "all"; from: string; to: string; page: number }`
  - `parseMovementQuery(raw: Record<string, string | string[] | undefined>): MovementQuery`
  - `paginate<T>(items: T[], page: number): { items: T[]; page: number; totalPages: number }`
  - `buildMovementHref(basePath: string, query: MovementQuery, patch?: Partial<MovementQuery>): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/movement-query.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { PAGE_SIZE, buildMovementHref, paginate, parseMovementQuery } from "@/lib/movement-query"

describe("parseMovementQuery", () => {
  it("una URL pelada da todos los filtros vacíos y la página 1", () => {
    expect(parseMovementQuery({})).toEqual({
      search: "",
      categoryId: "all",
      status: "all",
      from: "",
      to: "",
      page: 1,
    })
  })

  it("lee los filtros que vienen bien", () => {
    expect(
      parseMovementQuery({
        search: "kiosco",
        categoryId: "cat-1",
        status: "overdue",
        from: "2026-01-01",
        to: "2026-12-31",
        page: "3",
      }),
    ).toEqual({
      search: "kiosco",
      categoryId: "cat-1",
      status: "overdue",
      from: "2026-01-01",
      to: "2026-12-31",
      page: 3,
    })
  })

  it("un estado inventado cae en 'all' en vez de filtrar por nada", () => {
    expect(parseMovementQuery({ status: "borracho" }).status).toBe("all")
  })

  it("una fecha que no es ISO se descarta", () => {
    expect(parseMovementQuery({ from: "ayer", to: "2026-13-45" })).toMatchObject({
      from: "",
      to: "",
    })
  })

  it("una página no numérica, cero o negativa cae en 1", () => {
    expect(parseMovementQuery({ page: "hola" }).page).toBe(1)
    expect(parseMovementQuery({ page: "0" }).page).toBe(1)
    expect(parseMovementQuery({ page: "-4" }).page).toBe(1)
  })

  it("recorta el buscador y lo limita al largo de la columna", () => {
    expect(parseMovementQuery({ search: "  kiosco  " }).search).toBe("kiosco")
    expect(parseMovementQuery({ search: "x".repeat(500) }).search).toHaveLength(200)
  })

  it("con el parámetro repetido se queda con el primero", () => {
    // Next entrega string[] cuando la URL trae ?status=paid&status=overdue.
    expect(parseMovementQuery({ status: ["paid", "overdue"] }).status).toBe("paid")
  })
})

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i)

  it("corta la página pedida", () => {
    expect(paginate(items, 1).items).toEqual(items.slice(0, 20))
    expect(paginate(items, 2).items).toEqual(items.slice(20, 40))
    expect(paginate(items, 3).items).toEqual(items.slice(40, 45))
  })

  it("cuenta las páginas contando la última incompleta", () => {
    expect(paginate(items, 1).totalPages).toBe(3)
    expect(paginate(Array.from({ length: PAGE_SIZE }, (_, i) => i), 1).totalPages).toBe(1)
    expect(paginate(Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i), 1).totalPages).toBe(2)
  })

  it("una lista vacía es una página vacía, no cero páginas", () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, totalPages: 1 })
  })

  it("una página que ya no existe muestra la última, no una tabla en blanco", () => {
    // Pasa siempre: se filtra estando en la página 7 y el resultado tiene 2.
    expect(paginate(items, 99)).toMatchObject({ page: 3 })
    expect(paginate(items, 99).items).toEqual(items.slice(40, 45))
  })
})

describe("buildMovementHref", () => {
  const vacia = parseMovementQuery({})

  it("sin filtros devuelve la ruta pelada", () => {
    expect(buildMovementHref("/ingresos", vacia)).toBe("/ingresos")
  })

  it("no escribe los valores que ya son el default", () => {
    expect(buildMovementHref("/ingresos", vacia, { categoryId: "all", status: "all" })).toBe(
      "/ingresos",
    )
  })

  it("escribe sólo los filtros puestos", () => {
    expect(buildMovementHref("/egresos", vacia, { status: "overdue" })).toBe(
      "/egresos?status=overdue",
    )
  })

  it("cambiar un filtro vuelve a la página 1", () => {
    const enPagina7 = parseMovementQuery({ status: "paid", page: "7" })

    expect(buildMovementHref("/ingresos", enPagina7, { status: "overdue" })).toBe(
      "/ingresos?status=overdue",
    )
  })

  it("cambiar sólo de página conserva los filtros", () => {
    const conFiltros = parseMovementQuery({ search: "kiosco", status: "paid" })

    expect(buildMovementHref("/ingresos", conFiltros, { page: 4 })).toBe(
      "/ingresos?search=kiosco&status=paid&page=4",
    )
  })

  it("codifica el buscador", () => {
    expect(buildMovementHref("/ingresos", vacia, { search: "café & co" })).toBe(
      "/ingresos?search=caf%C3%A9+%26+co",
    )
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm vitest run src/lib/movement-query.test.ts
```

Esperado: FAIL — `Failed to resolve import "@/lib/movement-query"`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/lib/movement-query.ts`:

```ts
import { isValidIsoDate } from "@/lib/dates"
import type { MovementStatus } from "@/lib/movement-status"

/** Filas por página en las listas de ingresos y egresos. */
export const PAGE_SIZE = 20

const STATUS_VALUES: MovementStatus[] = ["pending", "paid", "overdue"]

/** El mismo tope que `movementSchema` le pone a la descripción. */
const SEARCH_MAX = 200

export type MovementQuery = {
  /** Texto libre contra la descripción. "" = sin filtro. */
  search: string
  /** Id de categoría, o "all". */
  categoryId: string
  status: MovementStatus | "all"
  /** ISO yyyy-mm-dd, o "" si no hay borde. */
  from: string
  to: string
  /** 1-based. */
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

/** Next entrega string[] cuando el parámetro viene repetido en la URL. */
function one(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? ""
}

/**
 * Normaliza el query string de /ingresos y /egresos. Todo lo que no entiende
 * cae en el default en vez de propagarse: la URL la escribe cualquiera, y un
 * `?status=borracho` no puede dejar la lista vacía ni tumbar la pantalla.
 */
export function parseMovementQuery(raw: RawParams): MovementQuery {
  const status = one(raw.status)
  const from = one(raw.from)
  const to = one(raw.to)
  const page = Number.parseInt(one(raw.page), 10)

  return {
    search: one(raw.search).trim().slice(0, SEARCH_MAX),
    categoryId: one(raw.categoryId) || "all",
    status: (STATUS_VALUES as string[]).includes(status) ? (status as MovementStatus) : "all",
    from: isValidIsoDate(from) ? from : "",
    to: isValidIsoDate(to) ? to : "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

export type Page<T> = {
  items: T[]
  /** La página que realmente se muestra: puede no ser la pedida. */
  page: number
  totalPages: number
}

/**
 * Corta la página pedida. Si se pide una que ya no existe —pasa siempre que un
 * filtro achica la lista con el `?page=` viejo todavía en la URL— devuelve la
 * última en vez de una lista vacía: una tabla en blanco con datos cargados se
 * lee como un bug.
 */
export function paginate<T>(items: T[], page: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const current = Math.min(Math.max(1, page), totalPages)
  const start = (current - 1) * PAGE_SIZE

  return { items: items.slice(start, start + PAGE_SIZE), page: current, totalPages }
}

/**
 * URL de la lista con `patch` aplicado sobre `query`. Lo que está en su default
 * no se escribe: así /ingresos sin filtros sigue siendo /ingresos y no
 * /ingresos?search=&categoryId=all&status=all&page=1.
 *
 * Tocar cualquier filtro resetea la página. Va acá y no en cada llamador
 * porque olvidárselo no rompe nada visible hasta que alguien filtra parado en
 * la página 7 y se encuentra con la tabla vacía.
 */
export function buildMovementHref(
  basePath: string,
  query: MovementQuery,
  patch: Partial<MovementQuery> = {},
): string {
  const cambiaFiltro = Object.keys(patch).some((k) => k !== "page")
  const next: MovementQuery = {
    ...query,
    ...patch,
    page: cambiaFiltro ? 1 : (patch.page ?? query.page),
  }

  const params = new URLSearchParams()
  if (next.search) params.set("search", next.search)
  if (next.categoryId !== "all") params.set("categoryId", next.categoryId)
  if (next.status !== "all") params.set("status", next.status)
  if (next.from) params.set("from", next.from)
  if (next.to) params.set("to", next.to)
  if (next.page > 1) params.set("page", String(next.page))

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
pnpm vitest run src/lib/movement-query.test.ts
```

Esperado: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/movement-query.ts src/lib/movement-query.test.ts
git commit -m "feat: parseo de filtros, corte de página y armado de URLs de la lista"
```

---

### Task 2: Filtro de descripción en `listMovements`

**Files:**
- Modify: `src/server/queries.ts:5` (import), `:60-66` (`MovementFilters`), `:72-79` (condiciones)
- Test: `src/server/queries.db.test.ts` (agregar casos dentro del `describe("listMovements")` que termina en `:702`)

**Interfaces:**
- Consumes: nada de la Task 1.
- Produces: `MovementFilters` gana `search?: string`. `listMovements(userId, { search })` matchea la descripción sin distinguir mayúsculas y con los comodines de LIKE escapados.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/server/queries.db.test.ts`, dentro del `describe("listMovements", ...)`, justo antes del test `"no trae movimientos de otro usuario"`:

```ts
  it("filtra por descripción sin distinguir mayúsculas", async () => {
    // Sembrados como "Kiosco de la mañana" / "Kiosco de la tarde": en minúscula
    // sólo matchean si la consulta usa ilike y no like.
    expect([...ids(await listMovements(USUARIO_A, { search: "kiosco" }))].sort()).toEqual(
      [MOV.junioTarde, MOV.junioTemprano].sort(),
    )
  })

  it("el filtro de descripción matchea en el medio del texto", async () => {
    expect([...ids(await listMovements(USUARIO_A, { search: "dólares" }))].sort()).toEqual(
      [MOV.alquiler, MOV.cambioVenta, MOV.sueldo].sort(),
    )
  })

  it("los comodines de LIKE se escapan en vez de traer todo", async () => {
    // Sin escapar, "%" es "cualquier cosa" y devolvería los nueve movimientos.
    expect(await listMovements(USUARIO_A, { search: "%" })).toEqual([])
    expect(await listMovements(USUARIO_A, { search: "_" })).toEqual([])
  })

  it("el filtro de descripción se combina con los demás", async () => {
    const movs = await listMovements(USUARIO_A, { search: "kiosco", kind: "expense" })

    expect(ids(movs)).toEqual([MOV.junioTarde, MOV.junioTemprano])
    expect(await listMovements(USUARIO_A, { search: "kiosco", kind: "income" })).toEqual([])
  })
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
pnpm test:db -- -t "descripción"
```

Esperado: FAIL de compilación de TypeScript — `Object literal may only specify known properties, and 'search' does not exist in type 'MovementFilters'`.

- [ ] **Step 3: Implementar el filtro**

En `src/server/queries.ts`, agregar `ilike` al import de la línea 5:

```ts
import { and, asc, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm"
```

Agregar el campo a `MovementFilters` (líneas 60-66):

```ts
export type MovementFilters = {
  kind?: "income" | "expense" | "exchange"
  categoryId?: string
  currency?: "ARS" | "USD"
  from?: string
  to?: string
  /** Texto libre contra la descripción, sin distinguir mayúsculas. */
  search?: string
}
```

Agregar el helper de escape justo arriba de `listMovements`:

```ts
/**
 * `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" traería TODA la
 * lista en vez de las descripciones que dicen "50%". La barra va primero o se
 * escaparía a sí misma en los dos reemplazos siguientes.
 */
function escapeLike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}
```

Y la condición dentro de `listMovements`, después de la de `to` (línea 78):

```ts
    if (filters.search) {
      conditions.push(ilike(movement.description, `%${escapeLike(filters.search)}%`))
    }
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
pnpm test:db
```

Esperado: PASS, incluidos los 4 casos nuevos. La suite entera de `queries.db.test.ts` tiene que seguir verde.

- [ ] **Step 5: Commit**

```bash
git add src/server/queries.ts src/server/queries.db.test.ts
git commit -m "feat: listMovements filtra por descripción con ilike"
```

---

### Task 3: Barra de filtros

**Files:**
- Create: `src/components/movement-filters.tsx`
- Test: `src/components/movement-filters.test.tsx`

**Interfaces:**
- Consumes: `buildMovementHref`, `MovementQuery` (Task 1); `Category` de `@/server/queries`.
- Produces: `<MovementFilters basePath={string} query={MovementQuery} categories={Category[]} />`, client component. Navega con `router.push`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/movement-filters.test.tsx`:

```tsx
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { MovementFilters } from "@/components/movement-filters"
import { parseMovementQuery } from "@/lib/movement-query"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: () => {} }),
}))

// Radix (el Select de shadcn) usa dos APIs de puntero que jsdom no implementa.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

const CATEGORIAS = [
  { id: "cat-1", userId: "u", name: "Supermercado", kind: "expense" as const, archived: false },
  { id: "cat-2", userId: "u", name: "Ocio", kind: "expense" as const, archived: true },
]

function montar(raw: Record<string, string> = {}) {
  push.mockClear()
  return render(
    <MovementFilters
      basePath="/egresos"
      query={parseMovementQuery(raw)}
      categories={CATEGORIAS}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("MovementFilters", () => {
  it("el buscador espera a que se termine de tipear antes de navegar", () => {
    vi.useFakeTimers()
    montar()

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kio" } })
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })

    // Dos teclas, ninguna navegación todavía: sin la espera serían dos.
    expect(push).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos?search=kiosco")
  })

  it("elegir una fecha navega con el filtro puesto", () => {
    montar()

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } })

    expect(push).toHaveBeenCalledWith("/egresos?from=2026-01-01")
  })

  it("cambiar un filtro con página vieja vuelve a la página 1", () => {
    montar({ page: "7", status: "paid" })

    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-12-31" } })

    expect(push).toHaveBeenCalledWith("/egresos?status=paid&to=2026-12-31")
  })

  it("muestra el valor que viene de la URL, no uno vacío", () => {
    montar({ search: "alquiler", from: "2026-03-01" })

    expect(screen.getByLabelText<HTMLInputElement>("Buscar").value).toBe("alquiler")
    expect(screen.getByLabelText<HTMLInputElement>("Desde").value).toBe("2026-03-01")
  })

  it("limpiar borra todos los filtros de una", () => {
    montar({ search: "alquiler", status: "overdue", page: "3" })

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }))

    expect(push).toHaveBeenCalledWith("/egresos")
  })

  it("sin filtros puestos no ofrece limpiar", () => {
    montar()

    expect(screen.queryByRole("button", { name: "Limpiar" })).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm vitest run src/components/movement-filters.test.tsx
```

Esperado: FAIL — `Failed to resolve import "@/components/movement-filters"`.

- [ ] **Step 3: Escribir el componente**

Crear `src/components/movement-filters.tsx`:

```tsx
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
pnpm vitest run src/components/movement-filters.test.tsx
```

Esperado: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/movement-filters.tsx src/components/movement-filters.test.tsx
git commit -m "feat: barra de filtros de la lista de movimientos"
```

---

### Task 4: Paginación

**Files:**
- Create: `src/components/movement-pagination.tsx`
- Test: `src/components/movement-pagination.test.tsx`

**Interfaces:**
- Consumes: `buildMovementHref`, `MovementQuery` (Task 1).
- Produces: `<MovementPagination basePath={string} query={MovementQuery} page={number} totalPages={number} />`. Server component (sin `"use client"`): sólo arma `href`s.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/movement-pagination.test.tsx`:

```tsx
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { MovementPagination } from "@/components/movement-pagination"
import { parseMovementQuery } from "@/lib/movement-query"

/**
 * `next/link` fuera del server de Next busca el contexto del router y no lo
 * encuentra. Acá sólo importa el `href` que sale, así que un `<a>` alcanza.
 */
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function montar(page: number, totalPages: number, raw: Record<string, string> = {}) {
  return render(
    <MovementPagination
      basePath="/ingresos"
      query={parseMovementQuery(raw)}
      page={page}
      totalPages={totalPages}
    />,
  )
}

const href = (nombre: string) => screen.getByRole("link", { name: nombre }).getAttribute("href")

afterEach(cleanup)

describe("MovementPagination", () => {
  it("con una sola página no muestra nada", () => {
    // Sin jest-dom en el repo: se compara el HTML, no con toBeEmptyDOMElement.
    expect(montar(1, 1).container.innerHTML).toBe("")
  })

  it("la página 1 no ofrece anterior y la última no ofrece siguiente", () => {
    montar(1, 3)
    expect(screen.queryByRole("link", { name: "Anterior" })).toBeNull()
    expect(screen.getByRole("link", { name: "Siguiente" })).toBeTruthy()

    cleanup()

    montar(3, 3)
    expect(screen.getByRole("link", { name: "Anterior" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Siguiente" })).toBeNull()
  })

  it("la página 1 no lleva ?page= en el enlace", () => {
    montar(2, 3)

    expect(href("1")).toBe("/ingresos")
    expect(href("3")).toBe("/ingresos?page=3")
  })

  it("los enlaces conservan los filtros puestos", () => {
    montar(1, 3, { search: "kiosco", status: "overdue" })

    expect(href("2")).toBe("/ingresos?search=kiosco&status=overdue&page=2")
  })

  it("marca la página actual para lectores de pantalla", () => {
    montar(2, 3)

    expect(screen.getByRole("link", { name: "2" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "1" }).getAttribute("aria-current")).toBeNull()
  })

  it("con muchas páginas muestra una ventana de 5 alrededor de la actual", () => {
    montar(10, 40)

    expect(screen.getAllByRole("link", { name: /^\d+$/ }).map((a) => a.textContent)).toEqual([
      "8",
      "9",
      "10",
      "11",
      "12",
    ])
  })

  it("la ventana no se sale por los bordes", () => {
    montar(1, 40)
    expect(screen.getAllByRole("link", { name: /^\d+$/ }).map((a) => a.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ])

    cleanup()

    montar(40, 40)
    expect(screen.getAllByRole("link", { name: /^\d+$/ }).map((a) => a.textContent)).toEqual([
      "36",
      "37",
      "38",
      "39",
      "40",
    ])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm vitest run src/components/movement-pagination.test.tsx
```

Esperado: FAIL — `Failed to resolve import "@/components/movement-pagination"`.

- [ ] **Step 3: Escribir el componente**

Crear `src/components/movement-pagination.tsx`:

```tsx
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { buildMovementHref, type MovementQuery } from "@/lib/movement-query"

/** Cuántos números se muestran alrededor de la página actual. */
const WINDOW = 5

type Props = {
  /** Ruta de la pantalla actual ("/ingresos" o "/egresos"), sin query. */
  basePath: string
  query: MovementQuery
  /** La página que se está mostrando de verdad, ya ajustada por `paginate`. */
  page: number
  totalPages: number
}

/**
 * Enlaces, no botones: la página vive en la URL igual que los filtros, así que
 * paginar es navegar. Mismo patrón que el resto de la pantalla, y de paso
 * funciona con el botón Atrás y con abrir en una pestaña nueva.
 */
export function MovementPagination({ basePath, query, page, totalPages }: Props) {
  if (totalPages <= 1) return null

  // La ventana se corre para no salirse por ninguno de los dos bordes: con
  // diez años de movimientos la lista completa de números no entra en pantalla.
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1))
  const end = Math.min(totalPages, start + WINDOW - 1)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-1">
      {page > 1 && (
        <Button asChild size="sm" variant="ghost">
          <Link href={buildMovementHref(basePath, query, { page: page - 1 })}>Anterior</Link>
        </Button>
      )}

      {pages.map((p) => (
        <Button key={p} asChild size="sm" variant={p === page ? "secondary" : "ghost"}>
          <Link
            href={buildMovementHref(basePath, query, { page: p })}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Link>
        </Button>
      ))}

      {page < totalPages && (
        <Button asChild size="sm" variant="ghost">
          <Link href={buildMovementHref(basePath, query, { page: page + 1 })}>Siguiente</Link>
        </Button>
      )}
    </nav>
  )
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
pnpm vitest run src/components/movement-pagination.test.tsx
```

Esperado: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/movement-pagination.tsx src/components/movement-pagination.test.tsx
git commit -m "feat: paginación de la lista de movimientos"
```

---

### Task 5: Cablear la pantalla y borrar el filtro viejo

**Files:**
- Modify: `src/components/movement-screen.tsx` (completo)
- Modify: `src/app/(app)/ingresos/page.tsx` (completo)
- Modify: `src/app/(app)/egresos/page.tsx` (completo)
- Modify: `src/components/movement-list.tsx:23-48` (mensaje de lista vacía)
- Delete: `src/components/status-filter.tsx`

**Interfaces:**
- Consumes: `parseMovementQuery`, `paginate` (Task 1); `listMovements({ search, categoryId, from, to })` (Task 2); `MovementFilters` (Task 3); `MovementPagination` (Task 4).
- Produces: nada para tareas posteriores. `MovementScreen` cambia su prop `statusParam: string | undefined` por `searchParams: Record<string, string | string[] | undefined>`.

- [ ] **Step 1: Reemplazar `src/components/movement-screen.tsx`**

Sustituir el archivo entero por:

```tsx
import { Suspense } from "react"

import { MovementFilters } from "@/components/movement-filters"
import { MovementFormDialog } from "@/components/movement-form-dialog"
import { MovementList } from "@/components/movement-list"
import { MovementPagination } from "@/components/movement-pagination"
import { todayInAr, type IsoDate } from "@/lib/dates"
import { paginate, parseMovementQuery } from "@/lib/movement-query"
import { BASE_PATHS } from "@/lib/movement-routes"
import { getMovementStatus } from "@/lib/movement-status"
import { fetchSuggestedRate, type RatePreference } from "@/lib/rate"
import { listCategories, listMovements, type Category } from "@/server/queries"
import { requireSettings } from "@/server/session"

const TITLES: Record<"income" | "expense", string> = {
  income: "Ingresos",
  expense: "Egresos",
}

type Props = {
  kind: "income" | "expense"
  /** Los search params crudos de la URL, tal como llegan del page.tsx. */
  searchParams: Record<string, string | string[] | undefined>
}

/**
 * La cotización sugerida sale de dolarapi, que en el peor caso tarda hasta
 * 3s (ver TIMEOUT_MS en @/lib/rate) antes de resolver a null. Separada en su
 * propio componente async y detrás de un Suspense: así esa espera no bloquea
 * el resto de la pantalla, que no depende de ella para pintar.
 */
async function MovementFormDialogWithRate({
  kind,
  categories,
  today,
  ratePreference,
}: {
  kind: "income" | "expense"
  categories: Category[]
  today: IsoDate
  ratePreference: RatePreference
}) {
  const rate = await fetchSuggestedRate(ratePreference)
  return (
    <MovementFormDialog
      kind={kind}
      categories={categories}
      suggestedRate={rate?.referenceRate ?? null}
      today={today}
    />
  )
}

/**
 * Cuerpo compartido de /ingresos y /egresos: sólo cambia `kind`. Ver
 * TITLES/BASE_PATHS de acá arriba para el resto de la diferencia.
 */
export async function MovementScreen({ kind, searchParams }: Props) {
  const { user, settings } = await requireSettings()
  const today = todayInAr()
  const query = parseMovementQuery(searchParams)

  // Dos consultas de categorías a propósito, no una: el desplegable de carga
  // (MovementForm) no debe ofrecer una categoría archivada, pero la lista
  // (MovementList) arma el nombre de la categoría de CADA movimiento —viejo
  // incluido— y una categoría archivada tiene que seguir resolviendo su nombre
  // ahí. Si las dos pantallas compartieran la misma lista "sólo activas",
  // archivar una categoría haría que los movimientos que la usaban pasen a
  // mostrar "—". El filtro usa la lista completa por el mismo motivo.
  const [activeCategories, allCategories, movements] = await Promise.all([
    listCategories(user.id, kind),
    listCategories(user.id, kind, true),
    listMovements(user.id, {
      kind,
      search: query.search || undefined,
      categoryId: query.categoryId === "all" ? undefined : query.categoryId,
      from: query.from || undefined,
      to: query.to || undefined,
    }),
  ])

  // El estado no es columna de la base: se deriva de las cuotas. Por eso se
  // filtra acá y no en el WHERE, y por eso la paginación va después y no con
  // un LIMIT: un LIMIT en la consulta no sabría cuántas filas van a sobrevivir
  // a este filtro.
  const filtered =
    query.status === "all"
      ? movements
      : movements.filter((m) => getMovementStatus(m.installments, today) === query.status)

  const { items, page, totalPages } = paginate(filtered, query.page)

  const hayFiltros =
    query.search !== "" ||
    query.categoryId !== "all" ||
    query.status !== "all" ||
    query.from !== "" ||
    query.to !== ""

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-paper">{TITLES[kind]}</h1>
        <Suspense
          fallback={
            <MovementFormDialog
              kind={kind}
              categories={activeCategories}
              suggestedRate={null}
              today={today}
            />
          }
        >
          <MovementFormDialogWithRate
            kind={kind}
            categories={activeCategories}
            today={today}
            ratePreference={settings.preferredRate as RatePreference}
          />
        </Suspense>
      </div>

      <MovementFilters
        basePath={BASE_PATHS[kind]}
        query={query}
        categories={allCategories}
      />

      <MovementList
        movements={items}
        categories={allCategories}
        today={today}
        emptyMessage={
          hayFiltros ? "Ningún movimiento entra en el filtro." : "Todavía no cargaste nada acá."
        }
      />

      <MovementPagination
        basePath={BASE_PATHS[kind]}
        query={query}
        page={page}
        totalPages={totalPages}
      />
    </div>
  )
}
```

- [ ] **Step 2: Aceptar el mensaje de vacío en `MovementList`**

En `src/components/movement-list.tsx`, agregar la prop al type (líneas 23-27):

```tsx
type Props = {
  movements: MovementWithInstallments[]
  categories: Category[]
  today: IsoDate
  /**
   * Sin esto, filtrar hasta cero resultados decía "todavía no cargaste nada":
   * el mensaje contradecía la tabla que la persona acababa de llenar.
   */
  emptyMessage: string
}
```

Cambiar la firma (línea 29) y el bloque de lista vacía (líneas 42-48):

```tsx
export function MovementList({ movements, categories, today, emptyMessage }: Props) {
```

```tsx
  if (movements.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</p>
  }
```

- [ ] **Step 3: Reemplazar los dos `page.tsx`**

`src/app/(app)/ingresos/page.tsx`:

```tsx
import { MovementScreen } from "@/components/movement-screen"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function IngresosPage({ searchParams }: Props) {
  return <MovementScreen kind="income" searchParams={await searchParams} />
}
```

`src/app/(app)/egresos/page.tsx`: idéntico, con `kind="expense"` y el componente renombrado a `EgresosPage`.

- [ ] **Step 4: Borrar el filtro viejo**

```bash
git rm src/components/status-filter.tsx
```

- [ ] **Step 5: Verificar que no quedó ninguna referencia**

```bash
grep -rn "StatusFilter\|statusParam" src/
```

Esperado: sin resultados. Si aparece algo, arreglarlo antes de seguir.

- [ ] **Step 6: Typecheck, lint y suite completa**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: los tres verdes. `pnpm test` corre también `movement-form.test.tsx`, que no se toca en este plan y tiene que seguir pasando.

- [ ] **Step 7: Verificar en el navegador**

Levantar el server con la herramienta de preview (`.claude/launch.json`, `pnpm dev` en el puerto 3100) e ir a `/egresos`. Comprobar, en este orden:

1. La barra de filtros aparece arriba de la tabla y las pills de estado viejas ya no están.
2. Escribir en Buscar filtra después de dejar de tipear, y la URL queda en `?search=...`.
3. Elegir una categoría y un estado acumula parámetros en la URL sin pisar los otros.
4. Con más de 20 filas aparece la paginación abajo; ir a la página 2 conserva los filtros en la URL.
5. Parado en la página 2, cambiar un filtro vuelve a la página 1.
6. Filtrar hasta cero resultados muestra "Ningún movimiento entra en el filtro.", no "Todavía no cargaste nada acá.".
7. Desde el dashboard, un enlace de "Próximos vencimientos" sigue cayendo en la lista con el estado ya filtrado.
8. Revisar la consola del navegador: sin errores ni warnings de React.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: filtros y paginación en las listas de ingresos y egresos"
```

---

## Desvíos respecto del spec

Anotados acá para que el spec y el código no queden discrepando en silencio:

1. **§4, rango de fechas:** el spec pide Popover + Calendar de shadcn. Se usan dos `Input type="date"`. Motivo: `react-day-picker` no está instalado (0 coincidencias en `pnpm-lock.yaml`) y sería dependencia nueva; el repo ya resuelve todas sus fechas con `<input type="date">` (`movement-form.tsx:141` y los vencimientos de cada cuota).
2. **§4, paginación:** el spec pide el `pagination` de shadcn. Se arma con `Button asChild` + `next/link`, igual que el `status-filter.tsx` que se está reemplazando. Motivo: el componente de shadcn renderiza `<a>` crudo, lo que fuerza una recarga completa de página en cada click.
3. **§6:** no hace falta correr ningún `shadcn add`. El plan no agrega dependencias.
4. **Agregado no previsto en el spec:** `MovementList` recibe el mensaje de lista vacía por prop (Task 5, Step 2). Sin eso, filtrar hasta cero resultados mostraba "Todavía no cargaste nada acá.", que es falso.
