import { redirect } from "next/navigation"

import { AuthCard, AuthNotice } from "@/components/auth-card"
import { AuthForm } from "@/components/auth-form"
import { authErrorMessage } from "@/lib/invitations"
import { hasAnyUser } from "@/server/access"
import { getOptionalUser } from "@/server/session"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Sin enlace a "Creá una cuenta": la instalación es privada y se entra por
 * invitación (§0.1 del plan v2). La única excepción es la instalación vacía,
 * que manda directo a crear la cuenta de administrador.
 */
export default async function LoginPage({ searchParams }: Props) {
  if (await getOptionalUser()) redirect("/dashboard")
  if (!(await hasAnyUser())) redirect("/registro")

  const params = await searchParams
  const error = authErrorMessage(typeof params.error === "string" ? params.error : undefined)

  return (
    <AuthCard title="Entrar a Mis Pesitos" description="Tus finanzas, ordenadas.">
      {error && <AuthNotice>{error}</AuthNotice>}
      <AuthForm mode="login" />
    </AuthCard>
  )
}
