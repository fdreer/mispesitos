"use client"

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { CalendarIcon, SearchIcon, XIcon } from "lucide-react"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

import { CategoryBadge } from "@/components/category-badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { dateToIso, formatIsoForDisplay, isoToDate } from "@/lib/dates"
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

const STATUS_OPTIONS: (MovementStatus | "all")[] = ["all", ...STATUS_VALUES]

/**
 * El texto que va adentro del `SelectValue` de cada desplegable, calculado
 * acá en vez de dejárselo a Radix.
 *
 * Radix no lo escribe él: cada `SelectItem` seleccionado se portea a sí mismo
 * dentro del trigger, y un portal existe recién después de montar en el
 * navegador. En el HTML que manda el servidor los dos triggers salen VACÍOS,
 * y como esta pantalla ahora manda la barra de filtros mucho antes que la
 * tabla (ver `movement-screen.tsx`), esa ventana pasó de invisible a bien
 * visible: se veían dos cajas sin texto donde tenía que decir con qué está
 * filtrada la lista. Pasándole `children` al `SelectValue`, Radix desactiva
 * ese portal (`valueNodeHasChildren`) y usa este texto, que sí viaja en el
 * HTML.
 *
 * `undefined` —no una cadena vacía— cuando el id no corresponde a ninguna
 * categoría conocida: eso es alcanzable escribiendo la URL a mano, y en ese
 * caso conviene volver al comportamiento de Radix (trigger vacío) antes que
 * mentir con "Todas" mientras la consulta filtra por un id que no existe.
 */
function categoriaValue(categoryId: string, categories: Category[]): ReactNode | undefined {
  if (categoryId === "all") return TODAS
  const name = categories.find((c) => c.id === categoryId)?.name
  return name === undefined ? undefined : <CategoryBadge name={name} />
}

/**
 * "Todas"/"Todos" van en texto atenuado y no en badge: no son una categoría
 * ni un estado, son la AUSENCIA de filtro, y darles un color propio las
 * pondría al mismo nivel visual que las opciones que sí filtran algo.
 */
const TODAS = <span className="text-muted-foreground">Todas</span>

/**
 * El punto de color de cada estado en el segmentado. Reusa el mismo `Badge`
 * que pinta la tabla (vía `StatusBadge`) pero sin texto: acá el texto va
 * afuera, en el propio segmento, así que el badge queda reducido a su color.
 * Es lo que convierte la fila de segmentos en la referencia de color de la
 * tabla — se ve qué color es cada estado sin tener que abrir nada.
 */
const DOT_CLASS = "size-1.5 rounded-full"

const DOT_COLOR: Record<MovementStatus, string> = {
  pending: "bg-ember-orange",
  paid: "bg-pulse-green",
  overdue: "bg-coral-red",
}

/** Cuánto se espera a que la persona deje de tipear antes de navegar. */
const DEBOUNCE_MS = 400

/**
 * Ancho de cada campo, en un solo lugar. Tres motivos para que sean anchos
 * FIJOS y no `flex-1`:
 *
 * 1. El buscador tenía `min-w-56 flex-1` y se comía todo el sobrante de la
 *    fila (unos 690px en un monitor normal) por ser el único que crecía. Un
 *    campo de texto de 700px para escribir "kiosco" no ayuda a nadie y hacía
 *    que la barra se leyera como un formulario en vez de un filtro.
 * 2. El período no tenía ancho propio: se lo daba su contenido, que cambia
 *    de "Elegir un período" a "01/03/2026 – 20/03/2026". Elegir un rango
 *    ensanchaba el botón y corría todo lo que tenía al lado.
 * 3. Con anchos fijos los cuatro campos ocupan lo mismo carga tras carga, así
 *    que el esqueleto de más abajo puede reservar exactamente el mismo lugar
 *    y la barra no salta cuando llegan las categorías.
 *
 * El período entra "01/03/2026 – 20/03/2026" (el texto más largo que
 * `rangoLabel` puede devolver) más el ícono, sin recortar.
 */
const FIELD_WIDTH = {
  search: "w-full sm:w-64",
  category: "w-40",
  /* El segmentado se mide por su contenido —cuatro etiquetas fijas— así que
   * no lleva ancho propio: dárselo lo recortaría o lo dejaría con aire. */
  status: "w-auto",
  period: "w-56",
} as const

/**
 * Las etiquetas de esta barra no son las de un formulario: acá no se carga
 * nada, se acota una tabla. En el tamaño de `Label` por default competían con
 * el h1 y con los encabezados de la tabla por la misma atención. Chicas y
 * atenuadas siguen estando (que es lo que pide la accesibilidad) sin pelearse
 * con el contenido.
 */
const LABEL_CLASS = "text-xs font-normal text-muted-foreground"

/** La fila entera. Compartida con el esqueleto para que no puedan separarse. */
const BAR_CLASS = "flex flex-wrap items-end gap-x-2 gap-y-3"

/**
 * Bordes de navegación del calendario, en años redondos para que el
 * desplegable de año quede prolijo. SIN esto, `captionLayout="dropdown"`
 * hace que react-day-picker 10 (`getNavMonth`) calcule sus propios bordes
 * y el techo queda en el 31 de diciembre de ESTE año: la flecha "mes
 * siguiente" se deshabilita ahí, el desplegable de año no ofrece ningún año
 * futuro, y `defaultMonth` se clampea de vuelta a ese techo aunque pida un
 * mes más adelante — un `?from=` de marzo del año que viene abriría en
 * diciembre de este año con la selección fuera de pantalla. Esta app SÍ
 * necesita ese margen hacia adelante: `addMonthsClamped` en
 * `installments.ts` agenda cuotas hasta `MAX_INSTALLMENTS = 120` meses
 * (diez años) desde la primera fecha de vencimiento, así que sin este borde
 * hay movimientos reales que ningún filtro de fecha puede alcanzar. No
 * simplificar sacando estos bordes: sin ellos el tope silencioso vuelve.
 */
const CALENDAR_YEARS_MARGIN = 10
const CALENDAR_START_MONTH = new Date(new Date().getFullYear() - CALENDAR_YEARS_MARGIN, 0, 1)
const CALENDAR_END_MONTH = new Date(new Date().getFullYear() + CALENDAR_YEARS_MARGIN, 11, 1)

/**
 * Texto del botón que dispara el calendario. Cubre los cuatro casos que
 * `MovementQuery` permite: sin rango, sólo piso, sólo techo, o los dos. Del
 * calendario en sí sólo salen tres (sin rango, sólo piso — un solo click,
 * ver `handleCalendarSelect` — y los dos lados); "sólo techo" es alcanzable
 * nada más escribiendo la URL a mano o desde un link externo (el `?status=`
 * del dashboard sigue el mismo patrón), así que el botón tiene que poder
 * mostrarlo igual.
 */
function rangoLabel(from: string, to: string): string {
  if (from && to) return `${formatIsoForDisplay(from)} – ${formatIsoForDisplay(to)}`
  if (from) return `Desde ${formatIsoForDisplay(from)}`
  if (to) return `Hasta ${formatIsoForDisplay(to)}`
  return "Elegir un período"
}

/**
 * `query.from`/`query.to` (los dos ISO) al `DateRange` que espera
 * `react-day-picker`. Se usa SÓLO para sembrar el borrador al abrir el
 * popover (ver `draft` más abajo) — el calendario en sí ya no lee `query`
 * directo mientras está abierto.
 */
function rangeFromQuery(query: Pick<MovementQuery, "from" | "to">): DateRange | undefined {
  return query.from || query.to
    ? {
        from: query.from ? isoToDate(query.from) : undefined,
        to: query.to ? isoToDate(query.to) : undefined,
      }
    : undefined
}

/** El camino inverso: de un `DateRange` (o nada) al patch que espera `go()`. */
function rangeToPatch(range: DateRange | undefined): Pick<MovementQuery, "from" | "to"> {
  return {
    from: range?.from ? dateToIso(range.from) : "",
    to: range?.to ? dateToIso(range.to) : "",
  }
}

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
  // Rango en BORRADOR mientras el popover del período está abierto. Esto NO
  // es un espejo del filtro comprometido (lo que la arquitectura prohíbe):
  // `query.from`/`query.to` siguen siendo la única fuente para el texto del
  // botón disparador y para todo lo demás de la barra. `draft` vive y muere
  // con una sola apertura del popover — se siembra desde `query` al abrir
  // (`handlePeriodoOpenChange`) y se descarta al cerrar, aplicado o no. Sin
  // esto, cada click en un día navegaba solo: `selected` salía de `query`,
  // que queda vieja durante toda la transición, así que un segundo click
  // antes de que el primero commitee no veía el primer día puesto y perdía
  // el rango a medias (hallazgo A de la auditoría).
  const [draft, setDraft] = useState<DateRange | undefined>(undefined)
  // Sólo existe para que el efecto de acá abajo sepa si tiene que resembrar
  // `draft` cuando cambia `query` (ver ese comentario): Radix es dueño de su
  // propio estado de apertura y sólo nos avisa por `onOpenChange`, así que
  // sin esto el componente no tiene forma de saber "¿el popover sigue
  // abierto ahora?" fuera de ese callback.
  const [periodoAbierto, setPeriodoAbierto] = useState(false)
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
  // Además de la sync de arriba, este efecto resiembra `draft` cuando `query`
  // cambia CON EL POPOVER TODAVÍA ABIERTO. Sin esto, Atrás/Adelante del
  // navegador puede deshacerse solo: Radix no cierra el popover por una
  // navegación de historial (no es él quien la escucha), así que `draft` se
  // queda con la selección de ANTES de volver; al cerrar, la comparación de
  // `handlePeriodoOpenChange` la ve distinta de la `query` ya vuelta atrás y
  // la reaplica con `go()`, pisando el Atrás que la persona acaba de pedir.
  //
  // La comparación es por VALOR de `from`/`to` contra `queryRef.current`, NO
  // por referencia del objeto `query` entero: eso es lo que distingue un
  // cambio externo (Atrás, Adelante, un link) de uno que este mismo
  // componente originó (`go()`, `limpiar()`, el debounce del buscador). Esos
  // tres actualizan `queryRef.current` SINCRÓNICAMENTE al valor que están por
  // confirmar, antes de que el `push` real commitee — así que para cuando la
  // prop `query` efectivamente llega, ya coincide EN VALOR con
  // `queryRef.current` (aunque sea un objeto `MovementQuery` nuevo, con otra
  // referencia: `hrefToQuery` arma uno de cero en cada llamada). Eso es clave
  // para no pisar una selección en curso: después de clickear "Borrar rango"
  // (que navega con el popover todavía abierto, ver más abajo), la persona
  // puede arrancar un rango nuevo mientras ese primer push todavía viaja: la
  // llegada tardía de la `query` ya vacía coincide EN VALOR con lo que
  // `queryRef.current` ya tenía anotado desde el click, así que no se
  // considera "externa" y el rango nuevo que se está armando no se resiembra
  // por encima.
  useEffect(() => {
    if (
      periodoAbierto &&
      (query.from !== queryRef.current.from || query.to !== queryRef.current.to)
    ) {
      setDraft(rangeFromQuery(query))
    }
    queryRef.current = query
  }, [query, periodoAbierto])
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
    // Cancela el debounce del buscador si todavía estaba armado. Ya no puede
    // pisar este filtro —parte de `queryRef.current`, que este push acaba de
    // actualizar—, pero sí navegaría una segunda vez 400ms después de que la
    // persona soltó el buscador y agarró otro control. Ese viaje no lo pidió
    // nadie.
    clearTimeout(searchTimeout.current)
    // Parte de `queryRef.current`, no de la prop `query`: ver el comentario
    // de `queryRef` más arriba (finding 1 de la auditoría).
    const href = buildMovementHref(basePath, queryRef.current, patch)
    queryRef.current = hrefToQuery(href)
    startTransition(() => {
      push(href)
    })
  }

  // Cada click en un día actualiza SÓLO el borrador, nunca navega (hallazgo
  // A). `react-day-picker` en modo rango, sin restricciones extra (`min`,
  // etc.), da un rango completo desde el primer click: `{from: día, to:
  // día}`, no el `{from, to: undefined}` progresivo que uno esperaría de un
  // picker de dos pasos (se verificó con un test descartable montando el
  // propio `Calendar` — no es un supuesto). Eso deja ambiguo qué quiso decir
  // un solo click: ¿"quiero sólo este día" o "quiero arrancar un rango
  // abierto"? Se resuelve a favor de lo segundo — un click sólo dejó
  // `from` puesto, sin `to` — porque es lo que hace falta para no perder la
  // capacidad de "desde tal fecha, sin techo" que los dos `<input
  // type="date">` anteriores tenían gratis (si el primer click completara
  // el rango solo, esa capacidad quedaría inalcanzable desde el mouse).
  //
  // Repetir el click sobre el MISMO día confirma ese día como rango
  // COMPLETO de un solo día (`from` y `to` iguales): es la propia rama
  // `from && !to` + `isSameDay` de `addToRange` (la función interna de
  // react-day-picker) la que arma ese resultado en cuanto `draft` ya trae
  // `from` puesto, así que no hace falta reimplementar nada para ese paso —
  // sólo evitar que el PRIMER click ya lo complete solo. Un tercer click
  // sobre el mismo día limpia el borrador entero (misma rama de la
  // librería, con el rango ya completo). Se documenta la secuencia acá
  // porque no es obvia leyendo sólo el código de abajo.
  //
  // `draft` con sólo `to` puesto (alcanzable escribiendo la URL a mano, no
  // desde el calendario) es la otra mitad del mismo problema: `addToRange`
  // no tiene ninguna rama para esa forma y devuelve `undefined` sin tocar
  // el día clickeado, borrando el filtro en el próximo click sin que la
  // persona lo haya pedido (tercer bug de este hallazgo). Por eso acá abajo
  // no se confía en el `range` que computó la librería para decidir si hay
  // que "arrancar de cero": se usa `triggerDate` (el día clickeado, que
  // react-day-picker manda siempre aparte de `range`) tanto para el primer
  // click de un borrador vacío como para cualquier click sobre un borrador
  // roto de sólo `to`. Ninguno de los dos casos pierde el click.
  function handleCalendarSelect(range: DateRange | undefined, triggerDate: Date) {
    if (!draft?.from) {
      setDraft({ from: triggerDate, to: undefined })
      return
    }
    setDraft(range)
  }

  /**
   * Abrir/cerrar el popover del período. Radix manda ACÁ los tres caminos de
   * cierre (Escape, click afuera, o el propio trigger de nuevo — los tres
   * llaman a `context.onOpenChange(false)` adentro de Radix, se verificó
   * leyendo `@radix-ui/react-popover`), así que un solo callback alcanza
   * para aplicar el borrador sin importar cómo se cerró.
   */
  function handlePeriodoOpenChange(open: boolean) {
    setPeriodoAbierto(open)
    if (open) {
      // Única vez que el borrador copia algo de afuera: se siembra desde el
      // filtro YA aplicado (`query`, igual que el resto de los controles de
      // esta barra — ver el comentario de `draft` más arriba). De acá en
      // más vive solo hasta que este mismo popover se cierre.
      setDraft(rangeFromQuery(query))
      return
    }
    const patch = rangeToPatch(draft)
    // El borrador vive y muere con esta apertura (ver el comentario de
    // `draft`): se descarta ACÁ, se haya aplicado o no, para que la próxima
    // apertura nunca herede nada de ésta.
    setDraft(undefined)
    // Contra `queryRef.current`, no contra la prop `query`: la prop se queda
    // vieja hasta que el viaje al servidor commitea (mismo motivo que en
    // `go()`, ver el comentario de `queryRef`). Comparar contra la prop
    // dejaba una ventana: clickear "Borrar rango" (que ya navegó y actualizó
    // `queryRef.current`, ver más abajo) y cerrar el popover ANTES de que
    // ese push commitee comparaba contra una `query` que todavía mostraba el
    // rango viejo, así que disparaba un segundo push idéntico — inocuo en el
    // resultado final, pero una entrada de historial de más y un viaje de
    // más que nadie pidió.
    if (patch.from === queryRef.current.from && patch.to === queryRef.current.to) return
    go(patch)
  }

  function limpiar() {
    // Mismo motivo que en `go()`: los filtros viejos ya no vuelven —la línea
    // de abajo deja `queryRef` en cero—, pero el texto que quedó capturado en
    // el timeout sí, y volvería solo 400ms después de vaciar el campo.
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
      className={cn(BAR_CLASS, "transition-opacity", pending && "opacity-60")}
      aria-busy={pending}
    >
      <div className={cn(FIELD_WIDTH.search, "space-y-1.5")}>
        <Label htmlFor="filtro-buscar" className={LABEL_CLASS}>
          Buscar
        </Label>
        {/* El ícono es lo único que distingue de un vistazo este campo de
            cualquier otro input de texto de la app; sin él, el único que decía
            "esto busca" era el placeholder, que desaparece apenas se tipea.
            `pointer-events-none` para que clickear encima siga cayendo en el
            input y no coma el foco. */}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="filtro-buscar"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Descripción"
            maxLength={SEARCH_MAX}
            className="pl-8"
          />
        </div>
      </div>

      <div className={cn(FIELD_WIDTH.category, "space-y-1.5")}>
        <Label htmlFor="filtro-categoria" className={LABEL_CLASS}>
          Categoría
        </Label>
        {/*
          El div envolvente no es decorativo. En el HTML del servidor el Select
          de Radix deja TRES hijos en esta columna, no dos: la etiqueta, el
          botón, y un nodo auxiliar propio que recién desaparece al hidratar.
          `space-y-1.5` le pone margen superior a todo hijo que no sea el
          primero, así que ese tercero se llevaba 6px y las dos columnas con
          desplegable quedaban 6px más altas que Buscar y Período. Con
          `items-end` en la fila, eso se veía como Categoría y Estado corridos
          hacia arriba hasta que hidrataba, y saltando a su lugar después —una
          ventana que antes casi no se veía y que ahora, con la barra llegando
          mucho antes que la tabla, sí se ve. El envoltorio deja siempre
          exactamente dos hijos acá y se lleva el nodo auxiliar adentro, donde
          ningún `space-y` lo cuenta.
        */}
        <div>
          <Select value={query.categoryId} onValueChange={(v) => go({ categoryId: v })}>
            <SelectTrigger id="filtro-categoria" className="w-full">
              <SelectValue>{categoriaValue(query.categoryId, categories)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{TODAS}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <CategoryBadge name={c.name} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/*
        Segmentado y no desplegable: son cuatro opciones fijas y conocidas, así
        que un `Select` cobraba dos clicks (abrir, elegir) y escondía tres de
        las cuatro hasta abrirlo. Acá se ve el estado activo y los otros tres a
        la vez, y cambiar de filtro es un solo click. De paso la fila funciona
        como referencia de color de la tabla: el punto de cada segmento es el
        mismo color que el badge de esa columna.

        `type="single"` de Radix devuelve "" al deseleccionar el activo
        (clickearlo de nuevo). Eso se mapea a "all" y no se descarta: apagar el
        estado que estaba puesto es exactamente pedir "todos".
      */}
      <div className={cn(FIELD_WIDTH.status, "space-y-1.5")}>
        <Label id="filtro-estado-label" className={LABEL_CLASS}>
          Estado
        </Label>
        <ToggleGroup
          id="filtro-estado"
          type="single"
          spacing={0}
          variant="outline"
          value={query.status}
          onValueChange={(v) => go({ status: (v || "all") as MovementStatus | "all" })}
          aria-labelledby="filtro-estado-label"
        >
          {STATUS_OPTIONS.map((o) => (
            <ToggleGroupItem key={o} value={o} className="data-[state=on]:text-paper">
              {o !== "all" && <span className={cn(DOT_CLASS, DOT_COLOR[o])} />}
              {o === "all" ? "Todos" : STATUS_LABELS[o]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className={cn(FIELD_WIDTH.period, "space-y-1.5")}>
        {/* Id propio en el Label: hace falta como blanco de `aria-labelledby`
            más abajo (hallazgo D). El `htmlFor` se deja como estaba, no
            estorba — con `aria-labelledby` puesto en el botón, el accname
            algorithm lo consulta a él primero y ni llega a mirar el `for`. */}
        <Label id="filtro-periodo-label" htmlFor="filtro-periodo" className={LABEL_CLASS}>
          Período
        </Label>
        <Popover onOpenChange={handlePeriodoOpenChange}>
          <PopoverTrigger asChild>
            <Button
              id="filtro-periodo"
              type="button"
              variant="outline"
              // El <Label htmlFor> de arriba es una asociación válida, y ese
              // es justo el problema (hallazgo D): el accname algorithm
              // consulta el <label> primero y corta ahí — nunca llega a leer
              // el contenido del botón, así que un lector de pantalla
              // anunciaba "Período, botón" igual con el rango puesto que
              // vacío. `aria-label` gana esa resolución ANTES que el `for` y
              // reemplaza el nombre entero (se probó primero con
              // `aria-labelledby` apuntando al propio botón para reusar su
              // contenido visible sin duplicar el string, pero el cómputo de
              // nombre accesible que usan los tests, al toparse con una
              // auto-referencia, no cae al contenido — devuelve sólo el
              // label; de ahí el string armado a mano): cambia solo cada vez
              // que cambia `rangoLabel`, así que nunca puede quedar
              // desincronizado del texto que se ve.
              aria-label={`Período: ${rangoLabel(query.from, query.to)}`}
              className={cn(
                "w-full justify-start font-normal",
                !query.from && !query.to && "text-muted-foreground",
              )}
            >
              <CalendarIcon />
              {rangoLabel(query.from, query.to)}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            // El wrapper de más arriba atenúa mientras `pending` está
            // prendido, pero ese div no alcanza a este contenido: Radix lo
            // porta a `document.body` (hallazgo C), fuera de ese subárbol.
            // Bajo el modelo de borrador ya no hay carrera de datos al
            // clickear (nada navega hasta que el popover cierra), pero SÍ
            // sigue habiendo un caso real: reabrir este mismo popover
            // mientras OTRO filtro todavía está en tránsito siembra el
            // borrador desde `query.from`/`query.to` (a propósito, ver
            // `handlePeriodoOpenChange`), que en ese momento puede seguir
            // mostrando el valor viejo. Repetir la atenuación acá adentro
            // es lo que avisa que ese valor recién sembrado podría no ser
            // el definitivo, igual que ya pasa con los Select de esta
            // barra.
            className={cn("w-auto p-0 transition-opacity", pending && "opacity-60")}
            aria-busy={pending}
            // El primitivo de Radix pone `role="dialog"` sin nombre propio
            // (hallazgo D, ítem menor); reusa la misma etiqueta del trigger
            // en vez de inventar un string aparte.
            aria-labelledby="filtro-periodo-label"
            align="start"
          >
            <Calendar
              mode="range"
              locale={es}
              captionLayout="dropdown"
              startMonth={CALENDAR_START_MONTH}
              endMonth={CALENDAR_END_MONTH}
              // Sin esto el calendario siempre abre en el mes de "hoy" (no
              // hay `forceMount`, así que se remonta en cada apertura) — con
              // años de movimientos cargados, un filtro de marzo de 2025
              // quedaba a 17 clicks de distancia (hallazgo B). Se deriva del
              // borrador, no de `query`, porque es lo que el calendario va a
              // mostrar seleccionado.
              defaultMonth={draft?.from ?? draft?.to}
              selected={draft}
              onSelect={handleCalendarSelect}
            />
            {/* "Limpiar" ya borra todo el filtrado; esto es aparte porque
                alguien puede querer sacar sólo el rango de fechas y dejar el
                resto (buscador, categoría, estado) como está. A diferencia
                de un click en un día, esto SÍ navega al toque: es una
                acción explícita de "borrar ya", no un paso de armado de
                rango, y tiene que poder usarse aunque el borrador todavía
                no tenga nada aplicado (por eso mira `draft`, no `query`). */}
            {(draft?.from || draft?.to) && (
              <div className="flex justify-end border-t p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(undefined)
                    go(rangeToPatch(undefined))
                  }}
                >
                  Borrar rango
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {hayFiltrosActivos(query) && (
        <Button type="button" variant="ghost" onClick={limpiar} className="text-muted-foreground">
          <XIcon />
          Limpiar
        </Button>
      )}
    </div>
  )
}

/**
 * Lo que se ve en el lugar de la barra mientras el servidor trae las
 * categorías (ver el `Suspense` de `movement-screen.tsx`).
 *
 * Reusa `BAR_CLASS`, `FIELD_WIDTH` y `LABEL_CLASS` de la barra real y muestra
 * las MISMAS etiquetas, no barritas grises: la fila queda ocupando
 * exactamente el mismo lugar, y cuando llegan las categorías lo único que
 * cambia son los cuatro controles. Sin eso, el esqueleto y la barra real se
 * pueden ir separando en anchos con cualquier retoque futuro y el cambio se
 * ve como un salto.
 *
 * Usa el mismo `Label` que la barra real y no un `<span>` con las mismas
 * clases: `Label` es un `flex items-center`, así que su caja no mide igual
 * que la de un span aunque el texto y el tamaño coincidan — con el span, las
 * etiquetas se corrían 2px al llegar las categorías.
 *
 * Todo el bloque va `aria-hidden`: son etiquetas sin ningún control al que
 * apunten. Que un lector de pantalla anuncie cuatro filtros que todavía no
 * existen es peor que que no anuncie nada — el `Suspense` de
 * `movement-screen.tsx` es quien tiene que contar esa espera.
 */
export function MovementFiltersSkeleton() {
  return (
    <div className={BAR_CLASS} aria-hidden>
      {[
        { label: "Buscar", width: FIELD_WIDTH.search, box: "w-full" },
        { label: "Categoría", width: FIELD_WIDTH.category, box: "w-full" },
        // El segmentado no tiene ancho de campo: reserva el que miden sus
        // cuatro etiquetas fijas, medido sobre el control ya renderizado.
        { label: "Estado", width: FIELD_WIDTH.status, box: "w-[309px]" },
        { label: "Período", width: FIELD_WIDTH.period, box: "w-full" },
      ].map((f) => (
        <div key={f.label} className={cn(f.width, "space-y-1.5")}>
          <Label className={LABEL_CLASS}>{f.label}</Label>
          <div
            className={cn(
              "h-8 animate-pulse rounded-lg border border-input bg-white/[0.02]",
              f.box,
            )}
          />
        </div>
      ))}
    </div>
  )
}
