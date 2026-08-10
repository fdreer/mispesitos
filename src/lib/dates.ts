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
 * Suma meses conservando el día. Si el día no existe en el mes destino
 * (un 31 en febrero), recorta al último día de ese mes.
 * Trabaja en UTC sobre los componentes de la fecha: nunca hay corrimiento de día.
 */
export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number)

  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth()

  // Día 0 del mes siguiente = último día del mes destino.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`
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
