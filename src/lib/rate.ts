export type RatePreference = "oficial" | "blue" | "mep"

export type SuggestedRate = {
  /** Pesos que pagás por comprar un dólar. */
  buyRate: number
  /** Pesos que recibís por vender un dólar. */
  sellRate: number
}

// dolarapi llama "bolsa" a lo que en la calle se conoce como MEP.
const ENDPOINTS: Record<RatePreference, string> = {
  oficial: "oficial",
  blue: "blue",
  mep: "bolsa",
}

const CACHE_SECONDS = 600

/**
 * Cotización sugerida. SIEMPRE puede devolver null: la sección 5.6 del spec
 * exige que una API de terceros nunca bloquee la carga de un movimiento.
 * Quien la llama muestra el campo vacío y editable.
 */
export async function fetchSuggestedRate(
  preference: RatePreference,
): Promise<SuggestedRate | null> {
  const url = `https://dolarapi.com/v1/dolares/${ENDPOINTS[preference]}`

  try {
    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS } })
    if (!response.ok) return null

    const data: unknown = await response.json()
    if (typeof data !== "object" || data === null) return null

    const { compra, venta } = data as { compra?: unknown; venta?: unknown }
    if (typeof compra !== "number" || typeof venta !== "number") return null
    if (!Number.isFinite(compra) || !Number.isFinite(venta)) return null

    // La API informa desde la perspectiva de la casa de cambio: su "venta"
    // es el precio al que vos comprás.
    return { buyRate: venta, sellRate: compra }
  } catch {
    return null
  }
}
