import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"

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
