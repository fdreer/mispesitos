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

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
  },
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
   * tanto el formulario como cualquier llamada directa a `/api/auth/sign-up/email`.
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
          ctx?.setCookie(INVITE_COOKIE, "", {
            httpOnly: true,
            sameSite: "lax",
            secure: (process.env.BETTER_AUTH_URL ?? "").startsWith("https://"),
            path: "/",
            maxAge: 0,
          })
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
