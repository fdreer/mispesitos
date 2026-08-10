import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getSettings } from "@/server/queries"

export async function getOptionalUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

/**
 * Punto de entrada obligatorio de todo acceso a datos.
 * Ninguna query se ejecuta sin haber pasado por acá.
 */
export async function requireUser() {
  const user = await getOptionalUser()
  if (!user) redirect("/login")
  return user
}

/**
 * Exige sesión Y onboarding completo. Todas las pantallas de la app la usan.
 */
export async function requireSettings() {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  if (!settings) redirect("/onboarding")
  return { user, settings }
}
