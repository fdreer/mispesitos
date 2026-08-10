import "server-only"

import { eq } from "drizzle-orm"

import { withUser } from "@/db/client"
import { userSettings } from "@/db/schema"

export type Settings = typeof userSettings.$inferSelect

export async function getSettings(userId: string): Promise<Settings | null> {
  const rows = await withUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  )
  return rows[0] ?? null
}
