import { redirect } from "next/navigation"

import { getOptionalUser } from "@/server/session"

/**
 * Sin landing pública: la instalación es privada (§0.1 del plan v2). Con
 * sesión, al dashboard; sin sesión, a /login, que en una instalación vacía
 * sigue de largo hasta crear la cuenta de administrador.
 */
export default async function HomePage() {
  redirect((await getOptionalUser()) ? "/dashboard" : "/login")
}
