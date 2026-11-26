import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AuthCard, AuthNotice } from "@/components/auth-card"
import { AuthForm } from "@/components/auth-form"
import { INVITE_COOKIE, INVITE_INVALID_MESSAGE, authErrorMessage } from "@/lib/invitations"
import { findUsableInvitation, hasAnyUser } from "@/server/access"
import { getOptionalUser } from "@/server/session"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const loginLink = (
  <p className="text-muted-foreground text-center text-sm">
    ¿Ya tenés cuenta?{" "}
    <Link href="/login" className="cursor-pointer font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80">
      Entrá
    </Link>
  </p>
)

export default async function RegistroPage({ searchParams }: Props) {
  if (await getOptionalUser()) redirect("/dashboard")

  const params = await searchParams
  const errorParam = typeof params.error === "string" ? params.error : undefined
  const error = authErrorMessage(errorParam)

  if (!(await hasAnyUser())) {
    return (
      <AuthCard
        title="Crear cuenta de administrador"
        description="Sos la primera persona en esta instalación. Después vas a poder invitar a quien quieras."
      >
        {error && <AuthNotice>{error}</AuthNotice>}
        <AuthForm mode="registro" submitLabel="Crear cuenta de administrador" />
      </AuthCard>
    )
  }

  const token = (await cookies()).get(INVITE_COOKIE)?.value
  const inv = token ? await findUsableInvitation(token) : null

  if (inv) {
    return (
      <AuthCard title="Crear cuenta" description="Te invitaron a Mis Pesitos. Tus finanzas son solo tuyas.">
        {error && <AuthNotice>{error}</AuthNotice>}
        <AuthForm mode="registro" fixedEmail={inv.email ?? undefined} />
        {loginLink}
      </AuthCard>
    )
  }

  const invalid = params.invitacion === "invalida" || Boolean(token)

  return (
    <AuthCard title="Instalación privada" description="Para crear una cuenta necesitás una invitación de quien administra esta instalación.">
      {(error || invalid) && <AuthNotice>{error ?? INVITE_INVALID_MESSAGE}</AuthNotice>}
      {loginLink}
    </AuthCard>
  )
}
