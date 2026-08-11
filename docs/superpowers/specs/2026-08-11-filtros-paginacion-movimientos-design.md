# Filtros y paginación en ingresos/egresos

**Fecha:** 2026-08-11
**Estado:** **implementado el 2026-08-11.** El código manda sobre este documento.
Los desvíos están anotados en la sección "Desvíos" al final del
[plan](../plans/2026-08-11-filtros-paginacion-movimientos.md).

> **El §4 y el §6 se cumplen tal como estaban escritos.** La primera versión de
> esta pantalla evitó el Popover + Calendar y el `pagination` de shadcn para no
> sumar dependencias. Esa restricción no la puso nadie: fue una decisión mía que
> el usuario corrigió apenas la vio. `react-day-picker` y `date-fns` entraron,
> los tres componentes están instalados, y el §6 se corrió tal cual.
>
> El único cuidado que sí hacía falta con el `pagination` de shadcn era real: su
> `PaginationLink` renderiza un `<a>` crudo, que fuerza una recarga completa en
> cada click. Se resolvió como documenta shadcn para App Router — cambiando ese
> `<a>` por `next/link` en `ui/pagination.tsx`. El próximo `shadcn add pagination`
> lo revierte en silencio; el archivo lleva un comentario avisando.
>
> **El rango de fechas no navega por click.** Se arma dentro del popover y se
> aplica al cerrarlo, con un solo `go({ from, to })`. Hay estado local ahí —el
> borrador— y es la única excepción a la regla de abajo: es una selección sin
> confirmar, no una copia del filtro ya aplicado. Sin eso, el gesto normal de dos
> clicks perdía el primero, porque el calendario lee `selected` del prop `query`,
> que sigue viejo durante todo el viaje al servidor.
>
> **El §5 decía que `movement-list.tsx` no se tocaba, y se tocó.** Recibe el
> mensaje de lista vacía por prop: filtrar hasta cero resultados mostraba
> "Todavía no cargaste nada acá", que con la tabla llena es falso.
>
> **Una regla que este spec no tenía y el sistema pide.** El §3.1 elige que los
> filtros vivan sólo en la URL. El costo es que el control muestra el valor viejo
> hasta que vuelve el round-trip del server. Se resolvió con `useTransition` y la
> barra atenuada mientras está pendiente: el lag no se elimina, se hace legible.
> Cualquier control nuevo que navegue en vez de mutar estado local sigue esa regla.
> Lo que NO se hizo, a propósito, es duplicar el estado en el cliente para tapar
> el lag: eso rompería el "un solo lugar" del §3.1.

## 1. Objetivo

Las páginas `/ingresos` y `/egresos` hoy solo filtran por estado (pills de link) y
traen la tabla completa sin paginar. Como la app va a acumular movimientos año
tras año, se necesitan más filtros (búsqueda por descripción, categoría, estado,
rango de fechas) y paginación real en la tabla, todo con componentes shadcn/ui.
El filtro de estado actual se reemplaza, no convive con el nuevo.

Fuera de alcance: cambios en el formulario de alta de movimientos, en el modelo
de datos (`movement`/`installment`/`category`), o en el dashboard.

## 2. Estado actual (referencia)

- `src/app/(app)/ingresos/page.tsx` y `egresos/page.tsx`: wrappers finos que leen
  `searchParams.status` y renderizan `MovementScreen`.
- `src/components/movement-screen.tsx`: server component. Hace
  `Promise.all([listCategories, listCategories(archived), listMovements])`,
  computa status por movimiento (`getMovementStatus`, derivado de installments,
  no es columna de DB) y filtra por status **en memoria** sobre la lista
  completa ya traída.
- `src/components/status-filter.tsx`: pills `Button asChild` + `Link` a
  `?status=`, sin JS cliente. Es el único filtro que existe hoy.
- `src/server/queries.ts`: `listMovements(userId, filters)` ya acepta
  `MovementFilters { kind, categoryId, currency, from, to }` y arma `WHERE` SQL
  con `eq`/`gte`/`lte` — pero `MovementScreen` solo le pasa `kind`. No hay
  `search` de descripción. No hay `.limit()`/`.offset()` en ningún lado.
- shadcn instalado: `alert-dialog`, `badge`, `button`, `card`, `chart`,
  `dialog`, `input`, `label`, `select`, `table`. Falta `popover`, `calendar`,
  `pagination`.

## 3. Decisiones tomadas

1. **Filtros por URL search params**, mismo patrón que el status-filter actual
   — no hay fetch cliente, todo server-rendered. Facilita compartir/bookmarkear
   una vista filtrada y evita sumar una capa de estado cliente nueva.
2. **Lo que es columna SQL se filtra en SQL**: descripción (`ilike`), categoría
   (`categoryId`), fechas (`from`/`to`, ya soportados). Reduce lo que viaja del
   DB a medida que el historial crece — es el punto que más importa dado que la
   data se acumula indefinidamente.
3. **Status se sigue filtrando en memoria**, después del fetch, igual que hoy.
   No es columna: se deriva de installments por movimiento. No se toca esa
   parte de la lógica, solo se le suma la paginación después.
4. **Paginación en memoria, después del filtro de status**: se pagina sobre el
   array ya filtrado (`slice`), no con `LIMIT`/`OFFSET` en SQL. Motivo: si el
   status entra en el filtro y el status no es SQL, un `LIMIT` en la query no
   garantizaría 20 resultados *después* de aplicar status — habría que traer de
   más y no se sabe cuánto de más. El filtrado SQL de descripción/categoría/
   fecha ya recorta lo que se trae antes de este paso, así que el costo del
   slice en memoria queda acotado a "movimientos de esta persona que matchean
   los filtros SQL", no a la tabla entera.
5. **Tamaño de página: 20 filas**, fijo (confirmado con el usuario).
6. **Reemplazo total del filtro de estado actual**: `status-filter.tsx` se
   borra, no queda como alternativa.

## 4. Componentes nuevos

- **`movement-filters.tsx`** (client component, `"use client"`): agrupa
  buscador de descripción (Input shadcn, debounce ~400ms), Select de
  categoría, Select de estado (mismas 4 opciones: Todos/Pagado/Pendiente/
  Vencido), y Popover+Calendar (`mode="range"`) para el rango de fechas. Cada
  cambio actualiza los search params vía `router.replace` y **resetea
  `page=1`**. Las opciones de categoría vienen de `listCategories` (incluye
  archivadas — un movimiento viejo puede tener una categoría ya archivada, y
  tiene que poder seguir filtrándose por ella).
- **`movement-pagination.tsx`** (server component, sin `"use client"`): mismo
  patrón que el `status-filter.tsx` actual — `Button asChild` + `Link` con
  query params, Prev/Next + números de página, construido sobre el
  `pagination.tsx` de shadcn. No necesita JS cliente porque solo arma URLs.

## 5. Cambios en archivos existentes

- **`src/server/queries.ts`**: `MovementFilters` suma `search?: string`;
  `listMovements` agrega `ilike(movement.description, ...)` cuando viene
  seteado. `categoryId`/`from`/`to` no cambian, solo pasan a usarse.
- **`src/components/movement-screen.tsx`**: parsea `search`/`categoryId`/
  `from`/`to`/`page` de `searchParams` además de `status`; los pasa a
  `listMovements`; después de computar status y filtrar en memoria, calcula
  `totalPages = Math.ceil(filtrados.length / 20)` y hace el `slice` de la
  página actual; renderiza `MovementFilters` en vez de `StatusFilter`, y
  `MovementPagination` debajo de la tabla.
- **`src/components/movement-list.tsx`**: sin cambios — sigue recibiendo un
  array de movimientos, ahora ya paginado.
- **Se borra `src/components/status-filter.tsx`.**

## 6. Dependencias

Instalar antes de tocar código:

```bash
pnpm dlx shadcn@latest add popover calendar pagination
```

## 7. No incluido / preguntas resueltas

- No se agrega filtro por moneda (`currency`) ni por `kind` en la UI —
  `kind` ya está fijo por la ruta (`/ingresos` vs `/egresos`), y no se pidió
  filtro de moneda.
- No se persiste el estado de los filtros más allá de la URL (no hay
  localStorage ni cookies).
- Tamaño de página fijo en 20, sin selector de tamaño configurable por el
  usuario — no se pidió y suma superficie sin necesidad clara.
