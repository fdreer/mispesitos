// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

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
 * "hoy", porque no le pasamos `defaultMonth`). Se calcula sobre el reloj real
 * en vez de fijarlo con fake timers: mezclar timers falsos con el
 * posicionamiento de Radix (que puede depender de rAF) es justamente el tipo
 * de acoplamiento que estos tests no necesitan para lo que verifican.
 */
function dayInCurrentMonth(day: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), day)
}

/**
 * Botón de un día del calendario, ubicado por su atributo `data-day`
 * (`CalendarDayButton` en calendar.tsx lo arma con `toLocaleDateString()`) y
 * no por el número visible: la grilla puede mostrar "días de afuera" del mes
 * siguiente o anterior con el mismo número que un día real del mes actual
 * (p. ej. el 5 de este mes y el 5 del que viene, en la misma semana final), y
 * buscar por texto encontraría el primero que aparezca en el DOM, no
 * necesariamente el del mes bajo prueba.
 */
function getDayButton(date: Date): HTMLElement {
  const target = date.toLocaleDateString()
  const found = screen.getAllByRole("button").find((b) => b.getAttribute("data-day") === target)
  if (!found) throw new Error(`No se encontró el botón del ${target}`)
  return found
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

  // El calendario abre por default en el mes real de "hoy" (no le pasamos
  // `defaultMonth`), así que el día que se clickea se calcula sobre el mes
  // vigente en vez de fijarlo con fake timers: eso evitaría depender de que
  // el posicionamiento de Radix (que puede usar rAF) conviva bien con timers
  // falsos, algo que no hacía falta comprobar para lo que este test verifica.
  it("elegir una fecha navega con el filtro puesto", () => {
    montar()

    fireEvent.click(screen.getByLabelText("Período"))
    const day = dayInCurrentMonth(10)
    fireEvent.click(getDayButton(day))

    // Sin restricciones (`min`, etc.) react-day-picker entrega un rango
    // completo desde el primer click: `{from: día, to: día}`, no el
    // `{from, to: undefined}` de un picker de dos pasos. Ver el comentario
    // de `handleRangeSelect` en movement-filters.tsx.
    const iso = dateToIso(day)
    expect(push).toHaveBeenCalledWith(`/egresos?from=${iso}&to=${iso}`)
  })

  it("cambiar un filtro con página vieja vuelve a la página 1", () => {
    montar({ page: "7", status: "paid" })

    fireEvent.click(screen.getByLabelText("Período"))
    const day = dayInCurrentMonth(20)
    fireEvent.click(getDayButton(day))

    const iso = dateToIso(day)
    expect(push).toHaveBeenCalledWith(`/egresos?status=paid&from=${iso}&to=${iso}`)
  })

  it("muestra el valor que viene de la URL, no uno vacío", () => {
    montar({ search: "alquiler", from: "2026-03-01" })

    expect(screen.getByLabelText<HTMLInputElement>("Buscar").value).toBe("alquiler")
    // Sólo `from` puesto (sin `to`) es un estado alcanzable por URL aunque el
    // calendario no lo produzca clickeando: ver `rangoLabel`.
    expect(screen.getByLabelText("Período").textContent).toBe("Desde 01/03/2026")
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
  // El primer cambio usa el calendario y el segundo Categoría (antes eran
  // Desde y Hasta, los dos inputs de fecha). Repetir el segundo click sobre
  // el MISMO calendario acá no serviría: su `selected` sale de la prop
  // `query`, que este test deja fija a propósito para simular el commit que
  // todavía no llegó, así que react-day-picker vería el mismo rango vacío de
  // antes y no completaría un rango — recalcularía un click "desde cero" en
  // vez de extenderlo (ver el reporte de esta tarea). Usar un control
  // distinto para el segundo cambio evita ese caso aparte y sigue probando
  // exactamente lo que este test verifica: que `queryRef` acumula un segundo
  // filtro en vez de pisar al primero.
  it("un segundo filtro durante una navegación pendiente se suma al primero en vez de pisarlo", () => {
    push.mockClear()
    const query = parseMovementQuery({})
    const { rerender } = render(
      <MovementFilters basePath="/egresos" query={query} categories={CATEGORIAS} />,
    )

    fireEvent.click(screen.getByLabelText("Período"))
    const day = dayInCurrentMonth(10)
    fireEvent.click(getDayButton(day))
    const iso = dateToIso(day)
    expect(push).toHaveBeenCalledWith(`/egresos?from=${iso}&to=${iso}`)

    // El commit todavía no llegó: la prop sigue siendo exactamente la misma.
    rerender(<MovementFilters basePath="/egresos" query={query} categories={CATEGORIAS} />)

    fireEvent.click(screen.getByLabelText("Categoría"))
    fireEvent.click(screen.getByText("Supermercado"))

    expect(push).toHaveBeenLastCalledWith(`/egresos?categoryId=cat-1&from=${iso}&to=${iso}`)
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
    expect(screen.getByLabelText("Período").id).toBe("filtro-periodo")
  })

  // Cobertura nueva: completar un rango de varios días con dos clicks tiene
  // que terminar en un solo llamado a `push` con `from` y `to` de días
  // distintos (no el mismo día repetido, que es lo que cubre el primer test
  // de este archivo). El segundo click necesita que la prop `query` ya
  // refleje el primero —por eso el `rerender`—: `Calendar` está controlado
  // por esa prop, y `addToRange` (la función de react-day-picker que decide
  // qué hacer con cada click) sólo sabe extender el rango si el `selected`
  // que recibe ya tiene el primer día adentro.
  it("completar un rango de varios días con dos clicks navega con from y to distintos", () => {
    const { rerender } = montar()

    fireEvent.click(screen.getByLabelText("Período"))
    const dayFrom = dayInCurrentMonth(5)
    fireEvent.click(getDayButton(dayFrom))
    const from = dateToIso(dayFrom)
    expect(push).toHaveBeenCalledWith(`/egresos?from=${from}&to=${from}`)

    rerender(
      <MovementFilters
        basePath="/egresos"
        query={parseMovementQuery({ from, to: from })}
        categories={CATEGORIAS}
      />,
    )

    const dayTo = dayInCurrentMonth(20)
    fireEvent.click(getDayButton(dayTo))
    const to = dateToIso(dayTo)
    expect(push).toHaveBeenLastCalledWith(`/egresos?from=${from}&to=${to}`)
  })

  // Con un rango ya puesto, "Borrar rango" tiene que sacar sólo `from`/`to` y
  // no tocar el resto: "Limpiar" (que borra todo) sigue estando para el caso
  // general, esto es para cuando la persona quiere conservar los demás
  // filtros.
  it("borrar rango saca sólo las fechas y deja el resto de los filtros", () => {
    montar({ status: "paid", from: "2026-01-05", to: "2026-01-20" })

    fireEvent.click(screen.getByLabelText("Período"))
    fireEvent.click(screen.getByRole("button", { name: "Borrar rango" }))

    expect(push).toHaveBeenCalledWith("/egresos?status=paid")
  })
})
