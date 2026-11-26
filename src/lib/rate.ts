export type RatePreference = "oficial" | "blue" | "mep"

export type SuggestedRate = {
  buyRate: number
  sellRate: number
  referenceRate: number
}

const ENDPOINTS: Record<RatePreference, string> = {
  oficial: "oficial",
  blue: "blue",
  mep: "bolsa",
}

const CACHE_SECONDS = 600

const TIMEOUT_MS = 3_000

export async function fetchSuggestedRate(
  preference: RatePreference,
): Promise<SuggestedRate | null> {
  const url = `https://dolarapi.com/v1/dolares/${ENDPOINTS[preference]}`

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

    // La API informa desde la perspectiva de la casa de cambio: su "venta"
    // es el precio al que vos comprás.
    return {
      buyRate: venta,
      sellRate: compra,
      // Acotado a 4 decimales (la precisión de numeric(12,4) y typedRate) para
      // que precargar el formulario con la sugerencia nunca falle la validación.
      referenceRate: Math.round(((compra + venta) / 2) * 10_000) / 10_000,
    }
  } catch {
    return null
  }
}
