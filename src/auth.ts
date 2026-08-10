import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import { db } from "@/db/client"
import * as schema from "@/db/schema"

/**
 * Google todavía no tiene credenciales (Task 10): el proyecto en Google Cloud
 * no está creado. Registrar el proveedor solo cuando las dos variables están
 * presentes evita que better-auth acepte un login social que en el fondo va a
 * fallar. Cuando se completen en .env.local, arranca sin tocar código.
 */
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

/**
 * Lo consume el formulario de auth (vía las páginas server) para no mostrar el
 * botón de Google mientras no haya credenciales: un botón que lleva a un error
 * es peor que un botón que no está.
 */
export const googleEnabled = Boolean(googleClientId && googleClientSecret)

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: googleClientId!,
          clientSecret: googleClientSecret!,
        },
      }
    : undefined,
})
