export type IsoDate = string

const AR_TIMEZONE = "America/Argentina/Buenos_Aires"

const AR_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: AR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export function todayInAr(): IsoDate {
  return AR_TODAY.format(new Date())
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

export function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

  const [year, month, day] = date.split("-").map(Number)
  if (month < 1 || month > 12 || day < 1) return false

  return day <= utcDate(year, month, 0).getUTCDate()
}

export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  if (!isValidIsoDate(date)) {
    throw new Error(`La fecha debe ser un día real en formato YYYY-MM-DD, no ${JSON.stringify(date)}`)
  }

  const [year, month, day] = date.split("-").map(Number)

  // `setUTCFullYear` en vez de `Date.UTC`: este último mapea los años de dos
  // dígitos a 1900+, así que el año 0025 se convertiría solo en 1925.
  const target = utcDate(year, month - 1 + months, 1)
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth()

  // Día 0 del mes siguiente = último día del mes destino.
  const lastDay = utcDate(targetYear, targetMonth + 1, 0).getUTCDate()

  const paddedYear = String(targetYear).padStart(4, "0")

  return `${paddedYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`
}

/**
 * Convierte un IsoDate al Date de calendario LOCAL que espera react-day-picker
 * (medianoche en la zona del navegador), armado por componentes con
 * `new Date(year, monthIndex, day)`. Pasarle el string directo a `new
 * Date(iso)` lo interpretaría como medianoche UTC, que en Buenos Aires
 * (UTC-3) cae en el día anterior — el calendario resaltaría el 10 para un
 * "2026-08-11" guardado.
 */
export function isoToDate(iso: IsoDate): Date {
  // Misma postura que `addMonthsClamped`: una función que promete devolver
  // una fecha real no puede fabricar una a partir de un string que no lo es.
  if (!isValidIsoDate(iso)) {
    throw new Error(`La fecha debe ser un día real en formato YYYY-MM-DD, no ${JSON.stringify(iso)}`)
  }

  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Lee un Date por sus componentes LOCALES, no por `toISOString()`: ese lee
 * UTC, así que un día elegido en el calendario a medianoche local (Buenos
 * Aires, UTC-3) volvería serializado como el día anterior.
 */
export function dateToIso(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, "0")
  return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function utcDate(year: number, month: number, day: number): Date {
  const d = new Date(0)
  d.setUTCFullYear(year, month, day)
  return d
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7)
}

/**
 * "YYYY-MM-DD" -> "DD/MM/YYYY", el orden en que se lee una fecha acá. Es sólo
 * reordenar texto, no pasa por `Date` en ningún momento: no hay zona horaria
 * de la que cuidarse.
 *
 * Vive acá y no en cada pantalla porque las fechas se muestran en cuatro
 * lugares —la columna Fecha de la tabla, el vencimiento de cada cuota, la
 * lista de operaciones de /cambios y el botón del filtro de período— y hasta
 * ahora sólo el último la formateaba: los otros tres imprimían el ISO crudo,
 * así que la misma fecha se leía "2026-08-11" en la tabla y "11/08/2026" en
 * el filtro que la acotaba.
 *
 * Devuelve la entrada tal cual si no es un día válido, en vez de fabricar
 * "undefined/undefined/": es texto para mostrar, y romper una pantalla entera
 * por una fila con la fecha en un formato inesperado es peor que mostrarla
 * como vino.
 */
export function formatIsoForDisplay(iso: string): string {
  if (!isValidIsoDate(iso)) return iso
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

/**
 * Las fechas ISO se comparan como texto sin ambigüedad, por eso no hace falta parsear.
 */
export function isOverdue(dueDate: IsoDate, today: IsoDate): boolean {
  return dueDate < today
}

const MS_PER_DAY = 86_400_000

function isoToUtcDayNumber(date: IsoDate): number {
  if (!isValidIsoDate(date)) {
    throw new Error(`La fecha debe ser un día real en formato YYYY-MM-DD, no ${JSON.stringify(date)}`)
  }
  const [year, month, day] = date.split("-").map(Number)
  return Math.floor(utcDate(year, month - 1, day).getTime() / MS_PER_DAY)
}

/**
 * Suma (o resta) días calendario a una `IsoDate`. Trabaja en UTC por número de
 * día para evitar cualquier salto por cambio de hora.
 */
export function addDaysIso(date: IsoDate, days: number): IsoDate {
  const dayNum = isoToUtcDayNumber(date)
  const d = new Date((dayNum + days) * MS_PER_DAY)
  const paddedYear = String(d.getUTCFullYear()).padStart(4, "0")
  return `${paddedYear}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Diferencia en días (`target - base`): positivo si `target` es posterior. */
export function diffDaysIso(target: IsoDate, base: IsoDate): number {
  return isoToUtcDayNumber(target) - isoToUtcDayNumber(base)
}

/** Primer y último día del mes `YYYY-MM`. */
export function monthRange(yearMonth: string): { from: IsoDate; to: IsoDate } {
  const [year, month] = yearMonth.split("-").map(Number)
  const lastDay = utcDate(year, month, 0).getUTCDate()
  return {
    from: `${yearMonth}-01`,
    to: `${yearMonth}-${pad(lastDay)}`,
  }
}

const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const

/** `"2026-11"` -> `"Noviembre 2026"`. */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number)
  const name = MONTH_NAMES_ES[month - 1]
  if (!name) return yearMonth
  return `${name} ${year}`
}

/**
 * Distancia legible para un vencimiento cercano ("vence hoy", "vence en 3
 * días", "venció hace 2 días"). Más allá de 14 días muestra la fecha corta
 * para no obligar a contar días en el calendario (§5.3 del plan v2).
 */
export function formatRelativeDue(
  dueDate: IsoDate,
  today: IsoDate,
  fallbackShortDate: string,
): string {
  const diff = diffDaysIso(dueDate, today)
  if (diff === 0) return "vence hoy"
  if (diff === 1) return "vence mañana"
  if (diff >= 2 && diff <= 14) return `vence en ${diff} días`
  if (diff === -1) return "venció ayer"
  if (diff <= -2 && diff >= -14) return `venció hace ${-diff} días`
  return diff < 0 ? `venció ${fallbackShortDate}` : `vence ${fallbackShortDate}`
}
