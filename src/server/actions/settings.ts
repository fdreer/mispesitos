"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { category, userSettings } from "@/db/schema"
import { DEFAULT_CATEGORIES } from "@/lib/default-categories"
import { settingsSchema } from "@/lib/schemas"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { requireUser } from "@/server/session"

export async function saveSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()

  const parsed = settingsSchema.safeParse({
    initialBalanceArsCents: formData.get("initialBalanceArs") ?? "",
    initialBalanceUsdCents: formData.get("initialBalanceUsd") ?? "",
    initialBalanceUsdRate: formData.get("initialBalanceUsdRate") ?? "",
    initialBalanceDate: formData.get("initialBalanceDate") ?? "",
    preferredRate: formData.get("preferredRate") ?? "",
  })

  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }

  // Drizzle mapea las columnas `numeric` a string, no a number (ver
  // src/db/schema.ts): el TC sale de Zod como number para poder compararlo en
  // la validación cruzada, y hay que devolverlo a string antes de escribirlo.
  const values = {
    ...parsed.data,
    initialBalanceUsdRate: String(parsed.data.initialBalanceUsdRate),
  }

  try {
    await withUser(user.id, async (tx) => {
      const existing = await tx
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .limit(1)

      if (existing.length > 0) {
        await tx.update(userSettings).set(values).where(eq(userSettings.userId, user.id))
        return
      }

      await tx.insert(userSettings).values({ userId: user.id, ...values })

      // Primera vez: se precargan las categorías para que nadie arranque con
      // una pantalla en blanco.
      await tx.insert(category).values(
        DEFAULT_CATEGORIES.map((c) => ({
          id: randomUUID(),
          userId: user.id,
          name: c.name,
          kind: c.kind,
        })),
      )
    })
  } catch (error) {
    console.error("saveSettings", error)
    return failure("No pudimos guardar los ajustes. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}
