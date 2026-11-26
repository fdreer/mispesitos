import { NextResponse, type NextRequest } from "next/server"

import { INVITE_COOKIE } from "@/lib/invitations"
import { findUsableInvitation } from "@/server/access"

/**
 * El link que comparte el admin: /invitacion/<token>.
 *
 * Guarda el token en una cookie HttpOnly y manda a /registro. El hook de
 * src/auth.ts lee esa cookie al crear el usuario y consume la invitación.
 *
 * Los redirects se arman sobre BETTER_AUTH_URL y no sobre `request.url`:
 * detrás de un reverse proxy (Caddy, Nginx, Traefik) `request.url` puede ser la
 * dirección interna del contenedor.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

  const inv = await findUsableInvitation(token)
  if (!inv) {
    const response = NextResponse.redirect(new URL("/registro?invitacion=invalida", base))
    response.cookies.delete(INVITE_COOKIE)
    return response
  }

  const response = NextResponse.redirect(new URL("/registro", base))
  response.cookies.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https://"),
    path: "/",
    expires: inv.expiresAt,
  })
  return response
}
