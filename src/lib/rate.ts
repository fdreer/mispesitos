export type RatePreference = "oficial" | "blue" | "mep"

export type SuggestedRate = {
  /** Pesos que pagás por comprar un dólar. SÓLO para el form de cambios. */
  buyRate: number
  /** Pesos que recibís por vender un dólar. SÓLO para el form de cambios. */
  sellRate: number
  /**
   * Punto medio, para valuar un movimiento que NO es una operación de cambio:
   * un sueldo cobrado en dólares, un alquiler pagado en dólares.
   *
   * Usar `buyRate` y `sellRate` acá fabrica resultado de la nada: cobrar y
   * pagar mil dólares el mismo día con la misma cotización daría $50.000 de
   * "ganancia por diferencia de cambio" que es puro spread de la casa de
   * cambio. Un movimiento que no cruza el mostrador se valúa a un solo TC.
   */
  referenceRate: number
}

// dolarapi llama "bolsa" a lo que en la calle se conoce como MEP.
const ENDPOINTS: Record<RatePreference, string> = {
  oficial: "oficial",
  blue: "blue",
  mep: "bolsa",
}

const CACHE_SECONDS = 600

// Sin esto, una conexión que nunca responde cuelga el render del formulario —
// justo lo que esta función existe para evitar. El abort cae en el catch.
const TIMEOUT_MS = 3_000

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
