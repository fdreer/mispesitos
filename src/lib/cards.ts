import { categoryHue, hueColor, paletteHue } from "@/lib/category-color"
import { addMonthsClamped, isValidIsoDate, monthKey, type IsoDate } from "@/lib/dates"
import { resolvePaidDate } from "@/lib/installments"
import { convertToArs, type Currency } from "@/lib/money"

export type Period = string

export type CardCycle = {
  closingDay: number
  dueDay: number
}

export type StatementDates = {
  period: Period
  closingDate: IsoDate
  dueDate: IsoDate
}

export type KnownStatement = StatementDates & {
  id: string
  paid: boolean
}

export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
}

export function addPeriods(period: Period, n: number): Period {
  return monthKey(addMonthsClamped(`${period}-01`, n))
}

/**
 * El día `day` del mes `period`, recortado al último día si ese mes no lo
 * tiene: una tarjeta que cierra "el 31" cierra el 30 en noviembre y el 28 en
 * febrero. Es el mismo recorte que `addMonthsClamped`.
 */
export function dayInPeriod(period: Period, day: number): IsoDate {
  // Todo mes tiene al menos 28 días: el primer candidato válido bajando desde
  // `day` aparece, como mucho, tres pasos después.
  for (let d = Math.min(Math.max(day, 1), 31); d > 28; d--) {
    const candidate = `${period}-${String(d).padStart(2, "0")}`
    if (isValidIsoDate(candidate)) return candidate
  }
  return `${period}-${String(Math.min(Math.max(day, 1), 28)).padStart(2, "0")}`
}

/**
 * Las fechas que se proponen para el resumen de `period` (§1.2): el cierre,
 * el `closing_day` de ese mes; el vencimiento, el `due_day` del mismo mes si
 * cae después del cierre, o del mes siguiente si no. "Cierra el 25 y vence el
 * 5" vence el 5 del mes que viene; "cierra el 3 y vence el 15", el 15 del
 * mismo mes.
 *
 * Son una PROPUESTA: los bancos corren las fechas todos los meses, y por eso
 * se guardan en cada resumen y se pueden corregir.
 */
export function proposeStatementDates(card: CardCycle, period: Period): StatementDates {
  const closingDate = dayInPeriod(period, card.closingDay)
  const duePeriod = card.dueDay > card.closingDay ? period : addPeriods(period, 1)
  return { period, closingDate, dueDate: dayInPeriod(duePeriod, card.dueDay) }
}

/** Las fechas reales si el resumen ya existe; si no, las propuestas. */
export function statementDatesFor(
  card: CardCycle,
  period: Period,
  known: readonly StatementDates[],
): StatementDates {
  return known.find((s) => s.period === period) ?? proposeStatementDates(card, period)
}

/**
 * El resumen en el que entra una compra (§1.3, decisión 7.2): el del mes de la
 * compra si la fecha es anterior o igual a su cierre; si no, el siguiente.
 *
 * Mira además el resumen del mes ANTERIOR, por un caso que sólo aparece con
 * fechas corregidas a mano: si el banco movió el cierre de noviembre al 2 de
 * diciembre, una compra del 1 de diciembre es de noviembre. Con las fechas
 * propuestas ese resumen siempre cierra antes del mes de la compra y la
 * pregunta da no, así que no cambia nada en el caso común.
 *
 * Y tampoco da por bueno "el siguiente" sin mirarlo: si el resumen siguiente
 * se corrigió a un cierre anterior a la compra, la compra no entra ahí.
 */
export function firstStatementPeriod(
  card: CardCycle,
  purchaseDate: IsoDate,
  known: readonly StatementDates[],
): Period {
  // El primero, desde el mes anterior, que cierra el día de la compra o
  // después. El tope de tres meses sólo existe para no iterar sin fin ante
  // datos absurdos: con fechas propuestas la respuesta siempre es el mes de
  // la compra o el siguiente, y con fechas corregidas a lo sumo uno más (el
  // siguiente corregido HACIA ATRÁS, a un día anterior a la compra: entonces
  // la compra ya no entra en él y va al otro).
  const own = monthKey(purchaseDate)
  for (let k = -1; k <= 2; k++) {
    const period = addPeriods(own, k)
    if (purchaseDate <= statementDatesFor(card, period, known).closingDate) return period
  }
  return addPeriods(own, 3)
}

/**
 * El resumen de cada cuota: la primera en el de la compra y la cuota *k* en
 * el que cierra *k − 1* meses después (§1.3). Devuelve uno por cuota, en
 * orden, con las fechas reales de los que ya existen y las propuestas de los
 * que habrá que crear.
 *
 * `firstPeriod` fija el resumen de la primera cuota en vez de calcularlo: es
 * el de una compra que ya está cargada y se edita sin cambiarle la tarjeta
 * ni la fecha. Corregir las fechas de un resumen no mueve las compras que ya
 * tiene (§14.1); sin el ancla, editar la descripción de una compra
 * recalcularía su resumen con el cierre corregido y la podría mudar —incluso
 * fuera de un resumen ya pagado—.
 */
export function assignStatements(
  card: CardCycle,
  purchaseDate: IsoDate,
  count: number,
  known: readonly StatementDates[],
  firstPeriod: Period | null = null,
): StatementDates[] {
  const first = firstPeriod ?? firstStatementPeriod(card, purchaseDate, known)
  return Array.from({ length: count }, (_, k) =>
    statementDatesFor(card, addPeriods(first, k), known),
  )
}

/** Cómo se nombra un período en pantalla: "nov 2026". */
const PERIOD_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

export function formatPeriod(period: Period): string {
  const [year, month] = period.split("-").map(Number)
  return PERIOD_FORMATTER.format(new Date(Date.UTC(year, month - 1, 15))).replace(".", "")
}

/**
 * Una cuota tal como queda después de la edición de una compra con tarjeta,
 * o tal como estaba antes. Lo que importa para saber si se toca un resumen
 * pagado.
 */
export type CardInstallmentSlot = {
  number: number
  statementId: string | null
  amountCents: number
}

/**
 * La primera cuota cuyo cambio tocaría un resumen YA PAGADO, o null si no hay
 * ninguna.
 *
 * Un resumen pagado es plata que ya salió en una fecha: si una compra nueva
 * cae ahí, o una edición le cambia el importe o le saca una cuota, el total
 * pagado cambiaría sin que nadie lo pague (§1.3: el saldo no cambia sin
 * aviso). Se permite lo que deja ese resumen exactamente igual: la misma
 * cuota, en el mismo resumen, por el mismo importe. Es lo que pasa al editar
 * la descripción o la categoría de una compra vieja.
 *
 * Se mira de los dos lados: lo que entra (`planned`) y lo que sale
 * (`previous`).
 */
export function paidStatementConflict(
  planned: readonly CardInstallmentSlot[],
  previous: readonly CardInstallmentSlot[],
  paidStatementIds: ReadonlySet<string>,
): number | null {
  const same = (a: CardInstallmentSlot, b: CardInstallmentSlot) =>
    a.number === b.number && a.statementId === b.statementId && a.amountCents === b.amountCents

  for (const p of planned) {
    if (p.statementId && paidStatementIds.has(p.statementId) && !previous.some((o) => same(o, p))) {
      return p.number
    }
  }
  for (const o of previous) {
    if (o.statementId && paidStatementIds.has(o.statementId) && !planned.some((p) => same(p, o))) {
      return o.number
    }
  }
  return null
}

export type StatementTotals = {
  arsCents: number
  usdCents: number
  count: number
}

/** Total del resumen por moneda: no se suman pesos con dólares. */
export function statementTotals(
  installments: readonly { amountCents: number; currency: string }[],
): StatementTotals {
  let arsCents = 0
  let usdCents = 0
  for (const i of installments) {
    if (i.currency === "USD") usdCents += i.amountCents
    else arsCents += i.amountCents
  }
  return { arsCents, usdCents, count: installments.length }
}

export type StatementPaymentMode = "usd" | "ars"

export type StatementPaymentResult =
  | { ok: true; paidDate: IsoDate; usdPaidArsCents: number | null }
  | { ok: false; message: string; field?: "paidDate" | "usdPaidArs" }

/**
 * Lo que se guarda al pagar un resumen.
 *
 * - La fecha: la misma regla que una cuota suelta (`resolvePaidDate`): hoy por
 *   defecto, nunca futura. Y además no antes del cierre.
 * - La parte en dólares: con dólares no guarda total en pesos; con pesos, el
 *   total en pesos debitado (`usdPaidArsCents`) es obligatorio y positivo. Si
 *   el resumen no tiene dólares, el modo no importa y se guarda null.
 */
export function resolveStatementPayment(input: {
  closingDate: IsoDate
  totals: StatementTotals
  requestedDate: IsoDate | undefined
  today: IsoDate
  mode: StatementPaymentMode
  usdPaidArsCents: number | null
}): StatementPaymentResult {
  if (input.totals.count === 0) {
    return { ok: false, message: "Este resumen no tiene cuotas: no hay nada que pagar." }
  }

  const resolved = resolvePaidDate(true, input.requestedDate, input.today)
  if (!resolved.ok) return { ok: false, message: resolved.message, field: "paidDate" }
  const paidDate = resolved.paidDate!

  if (paidDate < input.closingDate) {
    return {
      ok: false,
      message: "El resumen todavía no había cerrado en esa fecha.",
      field: "paidDate",
    }
  }

  if (input.totals.usdCents === 0 || input.mode === "usd") {
    return { ok: true, paidDate, usdPaidArsCents: null }
  }

  if (input.usdPaidArsCents === null || !(input.usdPaidArsCents > 0)) {
    return {
      ok: false,
      message: "Escribí el total en pesos debitado por los dólares.",
      field: "usdPaidArs",
    }
  }
  return { ok: true, paidDate, usdPaidArsCents: input.usdPaidArsCents }
}

/**
 * Reparte `totalCents` entre `weights` en proporción a cada peso usando el
 * método de resto mayor (Hamilton), de modo que la suma devuelta sea
 * exactamente `totalCents`.
 */
export function allocateProportional(totalCents: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return []
  const totalWeight = weights.reduce((acc, w) => acc + w, 0)
  if (totalWeight <= 0 || totalCents <= 0) return weights.map(() => 0)

  const parts = weights.map((weight, index) => {
    const exact = (totalCents * weight) / totalWeight
    const floor = Math.floor(exact)
    return { index, floor, remainder: exact - floor }
  })

  const leftover = totalCents - parts.reduce((acc, p) => acc + p.floor, 0)
  const byRemainder = [...parts].sort((a, b) =>
    b.remainder !== a.remainder ? b.remainder - a.remainder : a.index - b.index,
  )
  for (let i = 0; i < leftover; i++) {
    byRemainder[i].floor += 1
  }

  return parts.map((p) => p.floor)
}

/**
 * Tipo de cambio efectivo (pesos por dólar) al que se pagó un resumen en pesos.
 */
export function effectiveStatementRate(usdPaidArsCents: number, usdCents: number): number | null {
  if (usdCents <= 0 || usdPaidArsCents <= 0) return null
  return usdPaidArsCents / usdCents
}

/**
 * Traduce cuotas pagadas a lo percibido: las cuotas en dólares cuyo resumen
 * se pagó con pesos (`usdPaidArsCents !== null`) pasan a contar como pesos,
 * repartiendo `usdPaidArsCents` en proporción a su importe con resto mayor
 * para que la suma cierre al centavo.
 *
 * Si se pasa `statementUsdCents` mayor a la suma del subconjunto recibido (por
 * ejemplo en un informe filtrado por categoría), el remanente entra como un
 * peso extra para que las cuotas filtradas reciban sólo su proporción real.
 */
export function perceivedPayments<
  T extends {
    statementId: string | null
    currency: string
    amountCents: number
    usdPaidArsCents: number | null
    statementUsdCents?: number | null
  },
>(rows: readonly T[]): Omit<T, "usdPaidArsCents" | "statementUsdCents">[] {
  const convertedByIndex = new Map<number, number>()
  const groups = new Map<
    string,
    { usdPaidArsCents: number; statementUsdCents: number | null; items: { index: number; amountCents: number }[] }
  >()

  rows.forEach((row, index) => {
    if (row.currency !== "USD" || row.usdPaidArsCents === null || row.statementId === null) return
    let group = groups.get(row.statementId)
    if (!group) {
      group = {
        usdPaidArsCents: row.usdPaidArsCents,
        statementUsdCents: row.statementUsdCents ?? null,
        items: [],
      }
      groups.set(row.statementId, group)
    }
    group.items.push({ index, amountCents: row.amountCents })
  })

  for (const group of groups.values()) {
    const weights = group.items.map((item) => item.amountCents)
    const groupSum = weights.reduce((acc, w) => acc + w, 0)
    const extra =
      group.statementUsdCents !== null && group.statementUsdCents > groupSum
        ? group.statementUsdCents - groupSum
        : 0
    const shares = allocateProportional(
      group.usdPaidArsCents,
      extra > 0 ? [...weights, extra] : weights,
    )
    group.items.forEach((item, i) => {
      convertedByIndex.set(item.index, shares[i])
    })
  }

  return rows.map((row, index) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { usdPaidArsCents, statementUsdCents, ...cleaned } = row
    const base = cleaned as Omit<T, "usdPaidArsCents" | "statementUsdCents">
    const converted = convertedByIndex.get(index)
    if (converted === undefined) return base
    return {
      ...base,
      currency: "ARS" satisfies Currency,
      amountCents: converted,
    }
  })
}

export type AvailableCredit = {
  arsCents: number
  /** Sólo > 0 cuando no hubo cotización oficial para convertir los USD impagos. */
  unconvertedUsdCents: number
}

/**
 * Lo que queda del límite: el límite menos todo lo que la tarjeta todavía
 * debe —cada cuota impaga, de este resumen y de los que vienen—. La parte en
 * dólares se convierte al oficial vendedor de hoy; sin cotización se informa
 * aparte en `unconvertedUsdCents`.
 */
export function availableCredit(
  limitCents: number | null,
  unpaid: readonly { amountCents: number; currency: string }[],
  officialSellRate: number | null,
): AvailableCredit | null {
  if (limitCents === null) return null
  let arsUsed = 0
  let usdUsed = 0
  for (const i of unpaid) {
    if (i.currency === "USD") usdUsed += i.amountCents
    else arsUsed += i.amountCents
  }
  if (officialSellRate !== null && officialSellRate > 0) {
    return {
      arsCents: limitCents - arsUsed - convertToArs(usdUsed, officialSellRate),
      unconvertedUsdCents: 0,
    }
  }
  return {
    arsCents: limitCents - arsUsed,
    unconvertedUsdCents: usdUsed,
  }
}

export type StatementSummary = StatementDates & {
  id: string | null
  paidDate: IsoDate | null
  totals: StatementTotals
}

/**
 * Lo que muestra cada tarjeta en /tarjetas (§1.4):
 *
 * - `open`: el resumen que está acumulando, el que recibiría una compra de
 *   hoy. Si todavía no existe en la base, con sus fechas propuestas y en cero.
 * - `current`: el último que ya cerró, el que se tiene que pagar (o se pagó).
 *   Null si la tarjeta es nueva y nunca cerró uno.
 */
export function cardOverview(
  card: CardCycle,
  statements: readonly StatementSummary[],
  today: IsoDate,
): { open: StatementSummary; current: StatementSummary | null } {
  const openPeriod = firstStatementPeriod(card, today, statements)
  const open = statements.find((s) => s.period === openPeriod) ?? {
    ...proposeStatementDates(card, openPeriod),
    id: null,
    paidDate: null,
    totals: { arsCents: 0, usdCents: 0, count: 0 },
  }
  const current =
    [...statements]
      .filter((s) => s.period < openPeriod)
      .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0))[0] ?? null
  return { open, current }
}

/**
 * El color con que se pinta una tarjeta en listas: el elegido, o el hash del
 * nombre como las categorías sin color, para que dos tarjetas sin elegir no
 * se vean iguales.
 *
 * Vive acá y no junto a `CardDialog` porque lo llaman las páginas de
 * /tarjetas, que son Server Components: una función exportada desde un
 * módulo "use client" no se puede invocar del lado del servidor (Next la
 * convierte en una referencia de cliente y revienta en el render).
 */
export function cardColor(card: { name: string; color: string | null }): string {
  return hueColor(paletteHue(card.color) ?? categoryHue(card.name))
}
