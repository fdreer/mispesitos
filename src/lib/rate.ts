export type RatePreference = "oficial" | "blue" | "mep"

export type SuggestedRate = {
  buyRate: number
  sellRate: number
  referenceRate: number
}

export type OfficialRate = {
  compra: number
  venta: number
  fetchedAt: Date
}

export type OfficialRateSnapshot = OfficialRate & {
  stale: boolean
}

const ENDPOINTS: Record<RatePreference, string> = {
  oficial: "oficial",
  blue: "blue",
  mep: "bolsa",
}

const CACHE_SECONDS = 600

const TIMEOUT_MS = 3_000

async function fetchDolarEndpoint(
  endpoint: string,
): Promise<{ compra: number; venta: number } | null> {
  const url = `https://dolarapi.com/v1/dolares/${endpoint}`

  try {
    const response = await fetch(url, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null

    const data: unknown = await response.json()
    if (typeof data !== "object" || data === null) return null

    const { compra, venta } = data as { compra?: unknown; venta?: unknown }
    if (typeof compra !== "number" || typeof venta !== "number") return null
    if (!Number.isFinite(compra) || !Number.isFinite(venta)) return null
    // Un TC cero o negativo no es una cotización: pre-llenar el formulario con
    // eso valuaría los dólares en nada. Mejor campo vacío y que lo tipee.
    if (compra <= 0 || venta <= 0) return null

    return { compra, venta }
  } catch {
    return null
  }
}

/**
 * Cotización oficial del dólar (siempre `/dolares/oficial`).
 * `compra` es el oficial comprador (lo que te pagan si vendés USD);
 * `venta` es el oficial vendedor (lo que pagás si comprás USD o pagás un resumen en pesos).
 */
export async function fetchOfficialRate(): Promise<OfficialRate | null> {
  const quote = await fetchDolarEndpoint("oficial")
  if (!quote) return null
  return { ...quote, fetchedAt: new Date() }
}

/**
 * Cotización según la preferencia de Ajustes: queda sólo para precargar el TC
 * en compras y ventas de dólares (/cambios y el bloque de compra del pago de resumen).
 */
export async function fetchSuggestedRate(
  preference: RatePreference,
): Promise<SuggestedRate | null> {
  const quote = await fetchDolarEndpoint(ENDPOINTS[preference])
  if (!quote) return null

  // La API informa desde la perspectiva de la casa de cambio: su "venta"
  // es el precio al que vos comprás.
  return {
    buyRate: quote.venta,
    sellRate: quote.compra,
    // Acotado a 4 decimales (la precisión de numeric(12,4) y typedRate) para
    // que precargar el formulario con la sugerencia nunca falle la validación.
    referenceRate: Math.round(((quote.compra + quote.venta) / 2) * 10_000) / 10_000,
  }
}

const AR_TIMEZONE = "America/Argentina/Buenos_Aires"

const AR_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: AR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const AR_TIME_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const AR_DATE_SHORT_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
})

/**
 * Etiqueta legible para mostrar de cuándo es la cotización oficial:
 * "oficial de hoy 14:30", "oficial de ayer 14:30", "oficial del 25/11 14:30".
 */
export function formatOfficialRateLabel(fetchedAt: Date, now: Date = new Date()): string {
  const fetchedDay = AR_DAY_FORMATTER.format(fetchedAt)
  const todayDay = AR_DAY_FORMATTER.format(now)
  const yesterdayDay = AR_DAY_FORMATTER.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const time = AR_TIME_FORMATTER.format(fetchedAt)

  if (fetchedDay === todayDay) return `oficial de hoy ${time}`
  if (fetchedDay === yesterdayDay) return `oficial de ayer ${time}`
  return `oficial del ${AR_DATE_SHORT_FORMATTER.format(fetchedAt)} ${time}`
}
