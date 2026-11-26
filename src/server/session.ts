import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getUserRole } from "@/server/access"
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
  const user = session?.user
  if (!user) return null
  // Cinturón además del tirante: quitar el acceso ya borra las sesiones
  // (src/server/access.ts), pero si alguna sobrevive no abre nada. Devolver
  // null —y no redirigir— evita el ida y vuelta entre /login y /dashboard.
  if (user.disabledAt) return null
  return user
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
 * Exige ser el administrador de la instalación. El rol se relee de la base y
 * no de la sesión: es el dato que decide, y cuesta una consulta.
 */
export async function requireAdmin() {
  const user = await requireUser()
  if ((await getUserRole(user.id)) !== "admin") redirect("/dashboard")
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
