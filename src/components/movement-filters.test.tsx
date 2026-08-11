// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { es } from "date-fns/locale"

import { MovementFilters } from "@/components/movement-filters"
import { dateToIso } from "@/lib/dates"
import { parseMovementQuery } from "@/lib/movement-query"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: () => {} }),
}))

// Radix (el Select y el Popover de shadcn) usa dos APIs de puntero que jsdom
// no implementa. El Popover del calendario de rango no necesitó nada más
// además de esto — se probó por separado antes de escribir los tests de
// abajo (ver el reporte de esta tarea).
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

/**
 * Día `day` del mes que el calendario muestra por default (el mes real de
 * "hoy", porque no le pasamos `defaultMonth` — o, bajo el modelo de
 * borrador, porque el borrador con el que se abre está vacío). Se calcula
 * sobre el reloj real en vez de fijarlo con fake timers: mezclar timers
 * falsos con el posicionamiento de Radix (que puede depender de rAF) es
 * justamente el tipo de acoplamiento que estos tests no necesitan para lo
 * que verifican.
 */
function dayInCurrentMonth(day: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), day)
}

/**
 * Botón de un día del calendario, ubicado por su atributo `data-day`
 * (`CalendarDayButton` en calendar.tsx lo arma con
 * `day.date.toLocaleDateString(locale?.code)`, y el componente le pasa la
 * locale `es`) y no por el número visible: la grilla puede mostrar "días de
 * afuera" del mes siguiente o anterior con el mismo número que un día real
 * del mes actual (p. ej. el 5 de este mes y el 5 del que viene, en la misma
 * semana final), y buscar por texto encontraría el primero que aparezca en
 * el DOM, no necesariamente el del mes bajo prueba.
 *
 * `toLocaleDateString()` SIN código de locale usa el default de la máquina
 * que corre el test — no el de `es` que arma el componente. En una máquina
 * de-AR-o-similar los dos formatean igual (d/m/yyyy) y por eso la suite
 * pasaba igual, pero en una en-US-default `toLocaleDateString()` da
 * "m/d/yyyy" mientras el componente sigue armando "d/m/yyyy": ningún día se
 * encuentra y los tests de calendario explotan. Se fuerza acá el mismo
 * código de locale (`es.code`, es decir "es") que recibe el componente.
 */
function getDayButton(date: Date): HTMLElement {
  const target = date.toLocaleDateString(es.code)
  const found = screen.getAllByRole("button").find((b) => b.getAttribute("data-day") === target)
  if (!found) throw new Error(`No se encontró el botón del ${target}`)
  return found
}

/**
 * El botón que abre/cierra el popover del período. Antes se ubicaba con
 * `screen.getByLabelText("Período")`, pero el hallazgo D hace que el nombre
 * accesible del botón incluya el rango elegido (no sólo la etiqueta fija) —
 * ver `movement-filters.tsx`, `aria-labelledby` del trigger. Eso deja de
 * calzar con el string exacto "Período" en cuanto hay algo puesto, así que
 * acá se ancla sólo el PREFIJO del nombre accesible, que es estable pase lo
 * que pase con el resto (vacío, "Desde ...", o el rango completo).
 *
 * El mismo botón sirve para abrir Y cerrar: Radix trata un segundo click
 * sobre el trigger como un toggle (ver `PopoverTrigger` en
 * `@radix-ui/react-popover`, que compone su `onClick` con
 * `context.onOpenToggle`), así que "clickearlo de nuevo" es una de las tres
 * formas reales de cerrar el popover (las otras son Escape y click afuera;
 * las tres llaman al mismo `onOpenChange` — ver el comentario de
 * `handlePeriodoOpenChange` en movement-filters.tsx).
 */
function getPeriodoTrigger(): HTMLElement {
  return screen.getByRole("button", { name: /^Período\b/ })
}

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

  // El timeout del debounce es un setTimeout de JS puro, ajeno al ciclo de
  // vida de React: si el componente se desmonta antes de que se cumplan los
  // 400ms, nada lo cancela y dispara igual, navegando desde una pantalla que
  // ya no existe.
  it("desmontar mientras el buscador espera no navega después", () => {
    vi.useFakeTimers()
    const { unmount } = montar()

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })

    unmount()
    vi.advanceTimersByTime(400)

    expect(push).not.toHaveBeenCalled()
  })

  // Hallazgo A de la auditoría de esta rama: bajo el modelo viejo, cada click
  // en un día navegaba solo. Ahora sólo actualiza un borrador local; recién
  // CERRAR el popover aplica ese borrador con un único `go()`. Este test
  // cubre el mínimo que pide la tarea: "un borrador de un solo día cierra
  // como filtro abierto" — un solo click deja `from` puesto y `to` vacío, no
  // un rango de un solo día, para no perder la capacidad de "desde tal
  // fecha, sin techo" que el viejo `<input type="date">` tenía gratis.
  it("un solo click no navega todavía; cerrar el popover lo aplica como filtro abierto (hallazgo A)", () => {
    montar()

    fireEvent.click(getPeriodoTrigger())
    const day = dayInCurrentMonth(10)
    fireEvent.click(getDayButton(day))

    // El click sólo tocó el borrador: bajo el modelo viejo esto ya hubiera
    // navegado (ver el comentario de `handleCalendarSelect`).
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(getPeriodoTrigger())

    const iso = dateToIso(day)
    expect(push).toHaveBeenCalledWith(`/egresos?from=${iso}`)
  })

  it("cambiar un filtro con página vieja vuelve a la página 1", () => {
    montar({ page: "7", status: "paid" })

    fireEvent.click(getPeriodoTrigger())
    const day = dayInCurrentMonth(20)
    fireEvent.click(getDayButton(day))
    fireEvent.click(getPeriodoTrigger())

    const iso = dateToIso(day)
    expect(push).toHaveBeenCalledWith(`/egresos?status=paid&from=${iso}`)
  })

  it("muestra el valor que viene de la URL, no uno vacío", () => {
    montar({ search: "alquiler", from: "2026-03-01" })

    expect(screen.getByLabelText<HTMLInputElement>("Buscar").value).toBe("alquiler")
    // Sólo `from` puesto (sin `to`) es un estado alcanzable por URL, y
    // también el que deja un solo click del calendario (ver el test de
    // arriba): ver `rangoLabel`.
    expect(getPeriodoTrigger().textContent).toBe("Desde 01/03/2026")
  })

  it("los desplegables muestran el filtro puesto sin necesidad de abrirlos", () => {
    // Radix resuelve el texto del trigger desde los items, que estando cerrado
    // viven en un DocumentFragment. Si eso se rompe, la barra queda en blanco y
    // deja de decir por qué está filtrada la tabla.
    montar({ status: "overdue", categoryId: "cat-2" })

    expect(screen.getByLabelText("Estado").textContent).toBe("Vencido")
    expect(screen.getByLabelText("Categoría").textContent).toBe("Ocio")
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

  // Finding 1: "Limpiar" navegaba a basePath pero dejaba el estado local del
  // buscador (`search`) intacto, así que el input seguía mostrando el texto
  // tipeado aunque la URL ya no tuviera `search`. El test anterior
  // ("limpiar borra todos los filtros de una") sólo miraba el argumento de
  // `push` y por eso no lo detectaba.
  it("limpiar también vacía el buscador, no sólo la URL", () => {
    montar({ search: "alquiler", status: "overdue", page: "3" })

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }))

    expect(screen.getByLabelText<HTMLInputElement>("Buscar").value).toBe("")
  })

  // Finding 2: el timeout del debounce cierra sobre el `query` vigente al
  // tipear. Si mientras espera la persona cambia otro filtro, `go()` navega
  // ya mismo, pero el timeout seguía armado y disparaba después con el
  // `query` viejo (sin el filtro recién elegido), pisándolo.
  // Antes disparaba el "otro filtro" desde "Desde". Ahora usa Categoría: abrir
  // el Popover del calendario bajo fake timers mezclaría timers falsos con el
  // posicionamiento de Radix sin necesidad — este test no verifica nada
  // específico del calendario, sólo que CUALQUIER otro filtro cancela el
  // debounce del buscador.
  it("cambiar otro filtro mientras el buscador espera cancela ese debounce", () => {
    vi.useFakeTimers()
    montar({ status: "paid" })

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })
    fireEvent.click(screen.getByLabelText("Categoría"))
    fireEvent.click(screen.getByText("Supermercado"))

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos?categoryId=cat-1&status=paid")

    vi.advanceTimersByTime(400)

    // Si el debounce no se hubiera cancelado, acá dispararía con el `query`
    // de antes del cambio de categoría (sin `categoryId`) y lo pisaría.
    expect(push).toHaveBeenCalledTimes(1)
  })

  // Finding 3: "Limpiar" vacía `search`, y ese cambio de estado local
  // re-armaba el efecto de debounce (guardia `search === query.search`,
  // ahora falsa) con el `query` de ANTES del click cerrado en el closure. 400ms
  // después disparaba solo y resucitaba el filtro que "Limpiar" acababa de
  // borrar. Ningún test anterior lo agarraba porque ninguno avanzaba el reloj
  // después de clickear Limpiar.
  it("limpiar no deja un debounce viejo que resucite el filtro borrado", () => {
    vi.useFakeTimers()
    montar({ search: "alquiler", status: "overdue", page: "3" })

    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }))
    vi.advanceTimersByTime(400)

    // Sin la cancelación, acá habría un segundo push a "/egresos?status=overdue".
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/egresos")
  })

  // Minor: nada ejercía el onValueChange de los Select ni la asociación
  // htmlFor/id de sus Label. getByLabelText sólo encuentra el trigger si esa
  // asociación está bien hecha.
  it("elegir una categoría navega con ese filtro", () => {
    montar()

    fireEvent.click(screen.getByLabelText("Categoría"))
    fireEvent.click(screen.getByText("Supermercado"))

    expect(push).toHaveBeenCalledWith("/egresos?categoryId=cat-1")
  })

  it("elegir un estado navega con ese filtro", () => {
    montar()

    fireEvent.click(screen.getByLabelText("Estado"))
    fireEvent.click(screen.getByText("Pagado"))

    expect(push).toHaveBeenCalledWith("/egresos?status=paid")
  })

  // Finding 1 (auditoría de rama): `go()` armaba el próximo href desde la
  // prop `query`, que no se actualiza hasta que el viaje al servidor
  // commitea. Un segundo cambio de filtro disparado ANTES de ese commit
  // volvía a partir de la prop vieja y pisaba al primero en vez de sumarse.
  // El mock de `push` nunca re-renderiza el componente, así que acá hay que
  // simular el round-trip a mano: montamos, disparamos un cambio, y
  // re-renderizamos con LA MISMA prop `query` (mismo objeto, no uno nuevo con
  // los mismos valores — así es como React deja las props de un client
  // component cuando su server component padre todavía no volvió a
  // renderizar) antes de disparar el segundo cambio.
  //
  // Mecanismo cambiado (hallazgo A de ESTA auditoría): antes el primer cambio
  // usaba el calendario (con un `rerender` a mitad de camino simulando el
  // commit que todavía no llegó) y el segundo Categoría, justo porque el
  // `selected` del calendario viejo salía de la prop `query` y se quedaba
  // vieja durante la transición — usarlo dos veces seguidas no hubiera
  // completado un rango. Bajo el modelo de borrador esa limitación ya no
  // existe (el calendario ya no lee `query` mientras está abierto), pero lo
  // que este test verifica es otra cosa: que `queryRef` (no la prop) es la
  // base de CUALQUIER `go()`. Dos controles que navegan directo al click
  // (Categoría y Estado, sin pasar por un popover que abrir y cerrar) prueban
  // exactamente eso sin la complicación extra de simular una apertura de
  // calendario. La aserción final —el segundo push suma sobre el primero en
  // vez de pisarlo— es la misma que antes.
  it("un segundo filtro durante una navegación pendiente se suma al primero en vez de pisarlo", () => {
    push.mockClear()
    const query = parseMovementQuery({})
    const { rerender } = render(
      <MovementFilters basePath="/egresos" query={query} categories={CATEGORIAS} />,
    )

    fireEvent.click(screen.getByLabelText("Categoría"))
    fireEvent.click(screen.getByText("Supermercado"))
    expect(push).toHaveBeenCalledWith("/egresos?categoryId=cat-1")

    // El commit todavía no llegó: la prop sigue siendo exactamente la misma.
    rerender(<MovementFilters basePath="/egresos" query={query} categories={CATEGORIAS} />)

    fireEvent.click(screen.getByLabelText("Estado"))
    fireEvent.click(screen.getByText("Pagado"))

    expect(push).toHaveBeenLastCalledWith("/egresos?categoryId=cat-1&status=paid")
  })

  // Mismo agujero que el anterior pero del lado del buscador: el debounce
  // cierra sobre `queryRef.current`, que antes también sólo se actualizaba
  // cuando llegaba una prop nueva del server.
  it("el buscador con debounce pendiente también se suma a un filtro empujado antes", () => {
    vi.useFakeTimers()
    push.mockClear()
    const query = parseMovementQuery({})
    const { rerender } = render(
      <MovementFilters basePath="/egresos" query={query} categories={CATEGORIAS} />,
    )

    fireEvent.click(screen.getByLabelText("Categoría"))
    fireEvent.click(screen.getByText("Supermercado"))
    expect(push).toHaveBeenCalledWith("/egresos?categoryId=cat-1")

    rerender(<MovementFilters basePath="/egresos" query={query} categories={CATEGORIAS} />)

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "kiosco" } })
    vi.advanceTimersByTime(400)

    expect(push).toHaveBeenLastCalledWith("/egresos?search=kiosco&categoryId=cat-1")
  })

  // Finding 2 (auditoría de rama): estos ids coincidían con los de
  // `movement-form.tsx`, que vive en la misma pantalla dentro de un diálogo
  // portado al final del <body>. El elemento de acá quedaba primero en el
  // árbol y siempre ganaba la resolución de `for`, dejando sin nombre
  // accesible al campo del formulario. Prefijados con "filtro-" para que no
  // puedan volver a chocar con otro formulario de la pantalla.
  it("los ids de la barra de filtros están prefijados para no chocar con los del formulario de carga", () => {
    montar()

    expect(screen.getByLabelText("Buscar").id).toBe("filtro-buscar")
    expect(screen.getByLabelText("Categoría").id).toBe("filtro-categoria")
    expect(screen.getByLabelText("Estado").id).toBe("filtro-estado")
    // No con `getByLabelText`: ver el comentario de `getPeriodoTrigger` más
    // arriba (hallazgo D de esta auditoría).
    expect(getPeriodoTrigger().id).toBe("filtro-periodo")
  })

  // Cobertura mínima que pide la tarea para el hallazgo A: dos clicks DENTRO
  // de la misma apertura del popover tienen que navegar una sola vez, con
  // los dos días puestos. Antes esto necesitaba un `rerender` a mitad de
  // camino simulando un commit del servidor, porque cada click navegaba
  // solo y el segundo click dependía de que la prop `query` ya reflejara el
  // primero. Bajo el modelo de borrador eso ya no hace falta: el segundo
  // click ve el primero porque los dos leen y escriben el mismo estado local
  // (`draft`), no la prop.
  it("completar un rango de varios días con dos clicks en la misma apertura navega una sola vez con from y to distintos (hallazgo A)", () => {
    montar()

    fireEvent.click(getPeriodoTrigger())
    const dayFrom = dayInCurrentMonth(5)
    fireEvent.click(getDayButton(dayFrom))

    // Primer click: sólo borrador, todavía nada que navegar.
    expect(push).not.toHaveBeenCalled()

    const dayTo = dayInCurrentMonth(20)
    fireEvent.click(getDayButton(dayTo))

    // Segundo click: sigue sin navegar. La prueba de que no se perdió el
    // primer día está en el `push` de más abajo, después de cerrar.
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(getPeriodoTrigger())

    const from = dateToIso(dayFrom)
    const to = dateToIso(dayTo)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(`/egresos?from=${from}&to=${to}`)
  })

  // Cobertura mínima que pide la tarea para el hallazgo A: abrir y cerrar el
  // popover sin clickear ningún día no puede generar una navegación — ni
  // siquiera cuando ya había un rango puesto (el borrador se siembra igual a
  // lo que ya está aplicado, así que la comparación de `handlePeriodoOpenChange`
  // no encuentra ninguna diferencia).
  it("abrir y cerrar el popover sin tocar nada no navega (hallazgo A)", () => {
    montar({ status: "paid", from: "2026-01-05", to: "2026-01-20" })

    fireEvent.click(getPeriodoTrigger())
    fireEvent.click(getPeriodoTrigger())

    expect(push).not.toHaveBeenCalled()
  })

  // Cobertura mínima que pide la tarea para el hallazgo A: un `to` sin
  // `from` (sólo alcanzable escribiendo la URL a mano — el calendario nunca
  // produce esta forma clickeando) no puede desaparecer solo en el próximo
  // click. Antes sí pasaba: `addToRange` (la función interna de
  // react-day-picker) no tiene ninguna rama para "to sin from" y devolvía
  // `undefined` sin tocar el día clickeado, así que el click "perdía" en vez
  // de ganar.
  it("un estado inicial de sólo 'to' sin 'from' no se destruye al clickear un día (hallazgo A)", () => {
    montar({ to: "2026-03-20" })

    fireEvent.click(getPeriodoTrigger())
    // El calendario abre mostrando marzo de 2026 (hallazgo B: `defaultMonth`
    // sale del borrador recién sembrado, y acá el único lado sembrado es
    // `to`), así que el día que se clickea tiene que estar en ESE mes, no en
    // el mes real de "hoy".
    const day = new Date(2026, 2, 10)
    fireEvent.click(getDayButton(day))
    fireEvent.click(getPeriodoTrigger())

    // El click gana: arranca un borrador nuevo desde el día clickeado en vez
    // de desaparecer.
    const iso = dateToIso(day)
    expect(push).toHaveBeenCalledWith(`/egresos?from=${iso}`)
  })

  // Fix 1: sin `startMonth`/`endMonth`, `captionLayout="dropdown"` hace que
  // react-day-picker calcule sus propios bordes de navegación — hasta
  // diciembre de ESTE año nada más, sin importar qué mes pida
  // `defaultMonth` (`getInitialMonth` lo clampea de vuelta a ese borde).
  // Esta app agenda cuotas hasta `MAX_INSTALLMENTS = 120` meses (diez años)
  // adelante (`installments.ts`), así que sin bordes explícitos un filtro
  // de "desde enero del año que viene" no tiene forma de mostrarse: el
  // calendario abre en diciembre de este año con la selección fuera de
  // pantalla y ni la flecha "mes siguiente" ni el desplegable de año
  // ofrecen manera de llegar ahí.
  it("el calendario llega a enero del año que viene, no se topa en diciembre de este año", () => {
    const nextYear = new Date().getFullYear() + 1
    const day = new Date(nextYear, 0, 15)
    montar({ from: dateToIso(day) })

    fireEvent.click(getPeriodoTrigger())

    expect(getDayButton(day)).toBeTruthy()
  })

  // Con un rango ya puesto, "Borrar rango" tiene que sacar sólo `from`/`to` y
  // no tocar el resto: "Limpiar" (que borra todo) sigue estando para el caso
  // general, esto es para cuando la persona quiere conservar los demás
  // filtros. A diferencia de un click en un día, "Borrar rango" sigue
  // navegando al toque (no pasa por el borrador que se aplica al cerrar):
  // es una acción explícita de "borrar ya", no un paso de armado de rango.
  it("borrar rango saca sólo las fechas y deja el resto de los filtros", () => {
    montar({ status: "paid", from: "2026-01-05", to: "2026-01-20" })

    fireEvent.click(getPeriodoTrigger())
    fireEvent.click(screen.getByRole("button", { name: "Borrar rango" }))

    expect(push).toHaveBeenCalledWith("/egresos?status=paid")
  })

  // Fix 3: la comparación de cierre leía la prop `query`, que se queda vieja
  // hasta que el push commitea. "Borrar rango" ya navegó y actualizó
  // `queryRef.current` (no cierra el popover solo), así que cerrar ANTES de
  // que ese push commitee comparaba contra una `query` que todavía mostraba
  // el rango viejo y disparaba un segundo push idéntico. El mock de `push`
  // nunca hace "commitear" la navegación (no hay `rerender` acá), así que el
  // escenario queda expuesto tal cual: si la comparación mirara la prop en
  // vez de `queryRef.current`, este test vería dos pushes.
  it("cerrar el popover justo después de 'Borrar rango' no dispara un segundo push (fix 3)", () => {
    montar({ status: "paid", from: "2026-01-05", to: "2026-01-20" })

    fireEvent.click(getPeriodoTrigger())
    fireEvent.click(screen.getByRole("button", { name: "Borrar rango" }))
    expect(push).toHaveBeenCalledTimes(1)

    fireEvent.click(getPeriodoTrigger())

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenLastCalledWith("/egresos?status=paid")
  })

  // Fix 4: el borrador se siembra al abrir y no se resembraba si `query`
  // cambiaba con el popover TODAVÍA abierto. Radix no cierra el popover por
  // una navegación de historial (no la escucha), así que un Atrás del
  // navegador dejaba el borrador viejo puesto; al cerrar sin tocar nada, la
  // comparación lo veía distinto de la `query` ya vuelta atrás y reaplicaba
  // el rango de ANTES del Atrás, deshaciéndolo. Se simula "Atrás" con un
  // `rerender` a una prop `query` DISTINTA en valor (a diferencia de los
  // tests de "navegación pendiente" de más arriba, que resimulan con la
  // MISMA referencia para representar un commit propio todavía en tránsito):
  // acá se representa justo lo contrario, una navegación externa real.
  it("volver atrás con el navegador mientras el período está abierto no se deshace solo al cerrar (fix 4)", () => {
    push.mockClear()
    const queryA = parseMovementQuery({ from: "2026-01-05", to: "2026-01-20" })
    const { rerender } = render(
      <MovementFilters basePath="/egresos" query={queryA} categories={CATEGORIAS} />,
    )

    fireEvent.click(getPeriodoTrigger())

    // "Atrás": la prop `query` que manda el server component vuelve a un
    // estado sin rango sin que el componente haya pedido nada — el popover
    // sigue abierto, Radix no escucha el historial.
    const queryB = parseMovementQuery({})
    rerender(<MovementFilters basePath="/egresos" query={queryB} categories={CATEGORIAS} />)

    // Cerrar sin tocar nada.
    fireEvent.click(getPeriodoTrigger())

    // Si el borrador no se hubiera resembrado, acá reaplicaría el rango de
    // `queryA`, pisando el Atrás.
    expect(push).not.toHaveBeenCalled()
  })

  // Hallazgo D: el trigger tenía una asociación válida <Label htmlFor> +
  // <Button id>, y ese era justo el problema — el accname algorithm consulta
  // el <label> primero y devuelve ahí mismo, así que el contenido del botón
  // (el rango elegido) nunca se leía. Un lector de pantalla anunciaba
  // "Período, botón" igual con el rango vacío que con uno puesto. Se prueba
  // con `getByRole(..., { name })`, no `getByLabelText`, porque es
  // exactamente el cómputo que un lector de pantalla usa (accessible name),
  // y es el que hay que demostrar que cambia.
  it("el botón del período anuncia el rango elegido, no sólo la etiqueta fija 'Período' (hallazgo D)", () => {
    montar()

    // Sin rango: el nombre accesible es la etiqueta más lo que el botón ya
    // muestra vacío.
    expect(screen.getByRole("button", { name: "Período: Elegir un período" })).toBeTruthy()

    cleanup()
    montar({ from: "2026-03-01", to: "2026-03-20" })

    // Con un rango puesto: el nombre accesible cambia con él. Antes esto no
    // pasaba nunca — el nombre era siempre "Período".
    expect(
      screen.getByRole("button", { name: "Período: 01/03/2026 – 20/03/2026" }),
    ).toBeTruthy()
  })

  // Hallazgo D, ítem menor: el `PopoverContent` de Radix pone `role="dialog"`
  // sin ningún nombre accesible propio.
  it("el popover del período tiene nombre accesible (hallazgo D, ítem menor)", () => {
    montar()

    fireEvent.click(getPeriodoTrigger())

    expect(screen.getByRole("dialog", { name: "Período" })).toBeTruthy()
  })
})
