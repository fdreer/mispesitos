import "server-only"

import { cache } from "react"
import { after } from "next/server"
import { eq } from "drizzle-orm"

import { withUser } from "@/db/client"
import { userSettings } from "@/db/schema"
import { logDbError } from "@/lib/log-db-error"
import {
  fetchOfficialRate,
  shouldPersistOfficialRate,
  type OfficialRateSnapshot,
} from "@/lib/rate"
import type { Settings } from "@/server/queries"

/**
 * Obtiene la cotización oficial del dólar para el flujo, las tarjetas y el
 * dashboard. Si dolarapi responde, la guarda en `user_settings` como respaldo
 * (sólo si cambió, y después de enviar la respuesta: no frena el render); si
 * no responde, devuelve la última guardada (`stale: true`). Devuelve `null`
 * sólo si la API falló y nunca se obtuvo una antes.
 */
export const resolveOfficialRate = cache(async function resolveOfficialRate(
  userId: string,
  settings: Pick<Settings, "lastOfficialBuy" | "lastOfficialSell" | "lastOfficialAt">,
): Promise<OfficialRateSnapshot | null> {
  const live = await fetchOfficialRate()
  if (live) {
    if (shouldPersistOfficialRate(settings, live)) {
      after(async () => {
        try {
          await withUser(userId, (tx) =>
            tx
              .update(userSettings)
              .set({
                lastOfficialBuy: String(live.compra),
                lastOfficialSell: String(live.venta),
                lastOfficialAt: live.fetchedAt,
              })
              .where(eq(userSettings.userId, userId)),
          )
        } catch (error) {
          // El respaldo es best-effort: la respuesta ya salió.
          logDbError("resolveOfficialRate", error)
        }
      })
    }
    return { ...live, stale: false }
  }

  if (
    settings.lastOfficialBuy !== null &&
    settings.lastOfficialSell !== null &&
    settings.lastOfficialAt !== null
  ) {
    const compra = Number(settings.lastOfficialBuy)
    const venta = Number(settings.lastOfficialSell)
    if (Number.isFinite(compra) && Number.isFinite(venta) && compra > 0 && venta > 0) {
      return {
        compra,
        venta,
        fetchedAt: settings.lastOfficialAt,
        stale: true,
      }
    }
  }

  return null
})
