import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"

import { db } from "@/db/client"
import * as schema from "@/db/schema"
import {
  ACCESS_DISABLED_MESSAGE,
  INVITE_COOKIE,
  INVITE_INVALID_MESSAGE,
  SIGNUP_CLOSED_MESSAGE,
} from "@/lib/invitations"
import {
  claimInvitation,
  hasAnyUser,
  isUserDisabled,
  recordInvitationUser,
} from "@/server/access"

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
  user: {
    additionalFields: {
      // `input: false`: nadie los manda desde el formulario de registro. Los
      // pone el hook de abajo (role) o la pantalla del admin (disabledAt).
      role: { type: "string", required: false, defaultValue: "member", input: false },
      disabledAt: { type: "date", required: false, input: false },
    },
  },
  /**
   * La instalación es privada (§0.1 del plan v2). El cierre vive acá, en el
   * alta de usuario de better-auth, y no en la página de registro: así cubre
   * por igual el registro con correo y el primer ingreso con Google, que crea
   * el usuario en el callback de OAuth sin pasar por ningún formulario.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (newUser, ctx) => {
          // Instalación vacía: quien llega primero es el administrador. Si dos
          // se registran a la vez, los dos llegan acá con "admin" y el índice
          // único `user_single_admin` rechaza el segundo INSERT.
          if (!(await hasAnyUser())) {
            return { data: { ...newUser, role: "admin" } }
          }

          const token = ctx?.getCookie(INVITE_COOKIE)
          if (!token) {
            throw new APIError("FORBIDDEN", { code: "SIGNUP_CLOSED", message: SIGNUP_CLOSED_MESSAGE })
          }
          if (!(await claimInvitation(token, newUser.email))) {
            throw new APIError("FORBIDDEN", { code: "INVITE_INVALID", message: INVITE_INVALID_MESSAGE })
          }
          return { data: { ...newUser, role: "member" } }
        },
        after: async (createdUser, ctx) => {
          const token = ctx?.getCookie(INVITE_COOKIE)
          if (!token) return
          await recordInvitationUser(token, createdUser.id)
          // La invitación ya está gastada: la cookie no sirve más.
          ctx?.setCookie(INVITE_COOKIE, "", { path: "/", maxAge: 0 })
        },
      },
    },
    session: {
      create: {
        // Quien tiene el acceso quitado no puede abrir sesión nueva. Las que
        // ya tenía se borran al quitárselo (src/server/access.ts).
        before: async (newSession) => {
          if (await isUserDisabled(newSession.userId)) {
            throw new APIError("FORBIDDEN", { code: "ACCESS_DISABLED", message: ACCESS_DISABLED_MESSAGE })
          }
        },
      },
    },
  },
})
