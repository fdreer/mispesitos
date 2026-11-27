"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { withUser } from "@/db/client"
import { category, userSettings } from "@/db/schema"
import { DEFAULT_CATEGORIES } from "@/lib/default-categories"
import { logDbError } from "@/lib/log-db-error"
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
    initialBalanceDate: formData.get("initialBalanceDate") ?? "",
    preferredRate: formData.get("preferredRate") ?? "",
  })

  if (!parsed.success) {
    return failure("Revisá los datos.", z.flattenError(parsed.error).fieldErrors)
  }

  const values = parsed.data

  try {
    await withUser(user.id, async (tx) => {
      const existing = await tx
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .limit(1)

      await tx
        .insert(userSettings)
        .values({ userId: user.id, ...values })
        .onConflictDoUpdate({ target: userSettings.userId, set: values })

      if (existing.length > 0) return

      const parents = await tx
        .insert(category)
        .values(
          DEFAULT_CATEGORIES.map((c) => ({
            id: randomUUID(),
            userId: user.id,
            name: c.name,
            kind: c.kind,
            color: c.color ?? null,
            icon: c.icon ?? null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: category.id, name: category.name, kind: category.kind })

      const children = parents.flatMap((p) => {
        const plantilla = DEFAULT_CATEGORIES.find((c) => c.name === p.name && c.kind === p.kind)
        return (plantilla?.children ?? []).map((child) => ({
          id: randomUUID(),
          userId: user.id,
          name: child.name,
          kind: p.kind,
          parentId: p.id,
          icon: child.icon ?? null,
        }))
      })
      if (children.length > 0) {
        await tx.insert(category).values(children).onConflictDoNothing()
      }
    })
  } catch (error) {
    logDbError("saveSettings", error)
    return failure("No pudimos guardar los ajustes. Probá de nuevo.")
  }

  revalidatePath("/", "layout")
  return success()
}
