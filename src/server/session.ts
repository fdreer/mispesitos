import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getUserRole } from "@/server/access"
import { getSettings } from "@/server/queries"

export const getOptionalUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() })
  const user = session?.user
  if (!user) return null
  if (user.disabledAt) return null
  return user
})

export async function requireUser() {
  const user = await getOptionalUser()
  if (!user) redirect("/login")
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  // De la base y no de `user.role`: la sesión puede venir del cache de cookie
  // (src/auth.ts) con hasta un minuto de atraso, y esto abre la gestión de
  // usuarios.
  if ((await getUserRole(user.id)) !== "admin") redirect("/dashboard")
  return user
}

export async function requireSettings() {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  if (!settings) redirect("/onboarding")
  return { user, settings }
}
