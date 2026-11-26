import { NextResponse, type NextRequest } from "next/server"

import { INVITE_COOKIE } from "@/lib/invitations"
import { findUsableInvitation } from "@/server/access"

/**
 * El link que comparte el admin: /invitacion/<token>.
 *
 * Guarda el token en una cookie y manda a /registro. Va en cookie, y no como
 * parámetro del formulario, porque el alta con Google crea el usuario en el
 * callback de OAuth, a donde no llega ningún campo nuestro: lo único que viaja
 * con el navegador hasta ahí son las cookies. El hook de src/auth.ts la lee en
 * los dos caminos.
 *
 * Los redirects se arman sobre BETTER_AUTH_URL y no sobre `request.url`:
 * detrás de un proxy (el caso normal en self-hosted) `request.url` puede ser la
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
    // Lax y no Strict: la cookie tiene que viajar en la vuelta desde Google,
    // que es una navegación de nivel superior iniciada por otro sitio.
    sameSite: "lax",
    secure: base.startsWith("https://"),
    path: "/",
    expires: inv.expiresAt,
  })
  return response
}
