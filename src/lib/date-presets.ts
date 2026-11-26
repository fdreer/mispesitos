import {
  addDaysIso,
  addMonthsClamped,
  diffDaysIso,
  formatIsoForDisplay,
  isValidIsoDate,
  monthKey,
  monthRange,
  type IsoDate,
} from "@/lib/dates"

/**
 * Atajos de fecha y corrimiento de período (§4 del plan v2).
 *
 * Viven acá como funciones puras para que la barra de filtros (y en la Fase 5,
 * Informes) compartan exactamente las mismas definiciones de "Este mes",
 * "Últimos 3 meses", etc., y se prueben sin reloj ni React.
 */
export const DATE_PRESETS = [
  { id: "this_month", label: "Este mes" },
  { id: "last_month", label: "Mes pasado" },
  { id: "next_30_days", label: "Próximos 30 días" },
  { id: "last_3_months", label: "Últimos 3 meses" },
  { id: "last_6_months", label: "Últimos 6 meses" },
  { id: "last_12_months", label: "Últimos 12 meses" },
  { id: "this_year", label: "Este año" },
] as const

export type DatePresetId = (typeof DATE_PRESETS)[number]["id"]

/** El rango `[from, to]` de un atajo, calculado desde `today`. */
export function presetRange(preset: DatePresetId, today: IsoDate): { from: IsoDate; to: IsoDate } {
  const ym = monthKey(today)
  switch (preset) {
    case "this_month":
      return monthRange(ym)
    case "last_month":
      return monthRange(monthKey(addMonthsClamped(`${ym}-01`, -1)))
    case "next_30_days":
      return { from: today, to: addDaysIso(today, 30) }
    case "last_3_months":
      return {
        from: `${monthKey(addMonthsClamped(`${ym}-01`, -2))}-01`,
        to: monthRange(ym).to,
      }
    case "last_6_months":
      return {
        from: `${monthKey(addMonthsClamped(`${ym}-01`, -5))}-01`,
        to: monthRange(ym).to,
      }
    case "last_12_months":
      return {
        from: `${monthKey(addMonthsClamped(`${ym}-01`, -11))}-01`,
        to: monthRange(ym).to,
      }
    case "this_year": {
      const year = today.slice(0, 4)
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
  }
}

/** Qué atajo coincide con `[from, to]`, `"custom"` si es otro rango, o `null` si está vacío. */
export function detectDatePreset(
  from: string,
  to: string,
  today: IsoDate,
): DatePresetId | "custom" | null {
  if (!from && !to) return null
  if (from && to) {
    for (const preset of DATE_PRESETS) {
      const range = presetRange(preset.id, today)
      if (range.from === from && range.to === to) return preset.id
    }
  }
  return "custom"
}

/** Etiqueta corta para el botón del período y el chip activo. */
export function formatPeriodLabel(from: string, to: string, today: IsoDate): string {
  const detected = detectDatePreset(from, to, today)
  if (detected && detected !== "custom") {
    return DATE_PRESETS.find((p) => p.id === detected)!.label
  }
  if (from && to) return `${formatIsoForDisplay(from)} – ${formatIsoForDisplay(to)}`
  if (from) return `Desde ${formatIsoForDisplay(from)}`
  if (to) return `Hasta ${formatIsoForDisplay(to)}`
  return "Elegir un período"
}

function isWholeMonthSpan(from: IsoDate, to: IsoDate): number | null {
  if (!from.endsWith("-01")) return null
  const toRange = monthRange(monthKey(to))
  if (to !== toRange.to) return null

  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  const months = (ty - fy) * 12 + (tm - fm) + 1
  return months > 0 ? months : null
}

/**
 * Corre el período actual un paso hacia atrás (`-1`) o adelante (`1`).
 *
 * - Si el rango cubre meses calendario completos (1° del mes inicial al último
 *   día del mes final: Este mes, Mes pasado, Últimos 3/6/12 meses, Este año, o
 *   un mes custom entero), corre por esa cantidad de meses respetando los
 *   bordes de cada mes (correr febrero no lo deja de 28 días en marzo).
 * - Si es un rango arbitrario con los dos bordes (p. ej. Próximos 30 días),
 *   corre por la cantidad de días del intervalo (`diff + 1`).
 * - Sin rango completo (vacío o abierto de un solo lado), devuelve `null` para
 *   deshabilitar las flechas.
 */
export function shiftPeriod(
  from: string,
  to: string,
  direction: -1 | 1,
): { from: IsoDate; to: IsoDate } | null {
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return null

  const months = isWholeMonthSpan(from, to)
  if (months !== null) {
    const nextStart = addMonthsClamped(from, direction * months)
    const nextEndMonth = monthKey(addMonthsClamped(nextStart, months - 1))
    return { from: nextStart, to: monthRange(nextEndMonth).to }
  }

  const spanDays = diffDaysIso(to, from) + 1
  return {
    from: addDaysIso(from, direction * spanDays),
    to: addDaysIso(to, direction * spanDays),
  }
}
