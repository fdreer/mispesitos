import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"

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
  session: {
    /*
     * La sesión (con el usuario) viaja firmada en una cookie y se relee de la
     * base recién cuando vence: sin esto, cada request —layout, página y cada
     * Server Action— consultaba `session` + `user`. El costo: deshabilitar a
     * alguien o cambiarle el rol tarda hasta `maxAge` en llegar a una sesión
     * abierta. Por eso es corto, y `requireAdmin` igual lee el rol de la base.
     */
    cookieCache: { enabled: true, maxAge: 60 },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "member", input: false },
      disabledAt: { type: "date", required: false, input: false },
    },
  },
  // Deja que `auth.api` escriba cookies desde Server Actions (por ejemplo,
  // refrescar la cookie de sesión de arriba). Tiene que ir último.
  plugins: [nextCookies()],
  databaseHooks: {
    user: {
      create: {
        before: async (newUser, ctx) => {
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
        before: async (newSession) => {
          if (await isUserDisabled(newSession.userId)) {
            throw new APIError("FORBIDDEN", { code: "ACCESS_DISABLED", message: ACCESS_DISABLED_MESSAGE })
          }
        },
      },
    },
  },
})
