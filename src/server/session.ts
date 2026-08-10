import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getSettings } from "@/server/queries"

/**
 * `cache` de React, no un memo propio: memoiza por REQUEST, que es la vida útil
 * que corresponde a una sesión. Hace falta porque el layout de (app) y cada
 * página llaman las dos a `requireSettings()`, así que sin esto cada carga lee
 * la sesión dos veces —y cada lectura es un viaje a la base—.
 *
 * Fuera de un render de React (los tests) no hay caché instalada y la función
 * se llama directo, sin memo: la suite no cambia de comportamiento.
 */
export const getOptionalUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
})

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
