/** Fecha de negocio: siempre "YYYY-MM-DD", sin hora y sin zona horaria. */
export type IsoDate = string

const AR_TIMEZONE = "America/Argentina/Buenos_Aires"

// "en-CA" formatea como YYYY-MM-DD, que es exactamente el formato que guardamos.
const AR_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: AR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Hoy según el reloj de Buenos Aires, no el del servidor. */
export function todayInAr(): IsoDate {
  return AR_TODAY.format(new Date())
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * ¿Es "YYYY-MM-DD" y además un día que existe? El formato solo no alcanza:
 * "2026-02-30" y "2026-00-00" tienen la forma correcta y no son días.
 */
export function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

  const [year, month, day] = date.split("-").map(Number)
  if (month < 1 || month > 12 || day < 1) return false

  // Día 0 del mes siguiente = último día de este mes.
  return day <= utcDate(year, month, 0).getUTCDate()
}

/**
 * Suma meses conservando el día. Si el día no existe en el mes destino
 * (un 31 en febrero), recorta al último día de ese mes.
 * Trabaja en UTC sobre los componentes de la fecha: nunca hay corrimiento de día.
 */
export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  // `IsoDate` es un alias de string: el tipo no protege nada. Sin este chequeo,
  // "hoy" devuelve "NaN-NaN-NaN" y eso termina insertado en un vencimiento.
  // Y con el formato solo no alcanza: "2026-00-00" pasa la forma y sale de acá
  // como "2026-01-00", que tampoco es un día — una función que promete
  // devolver una fecha válida no puede fabricar una que no existe.
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
 * Las fechas ISO se comparan como texto sin ambigüedad, por eso no hace falta parsear.
 */
export function isOverdue(dueDate: IsoDate, today: IsoDate): boolean {
  return dueDate < today
}
