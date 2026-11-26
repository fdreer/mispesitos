"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { normalizeInviteEmail } from "@/lib/invitations"
import { logDbError } from "@/lib/log-db-error"
import { failure, success, type ActionResult } from "@/server/actions/result"
import { insertInvitation, revokeInvitationById, setUserDisabled } from "@/server/access"
import { requireAdmin } from "@/server/session"

const PATH = "/ajustes/usuarios"

export type CreateInvitationResult = ActionResult | { ok: true; link: string }

/**
 * Genera una invitación y devuelve el link completo. El token en claro sólo
 * existe en esta respuesta: en la base queda su hash, así que si el admin lo
 * pierde, genera otra.
 */
export async function createInvitation(
  _prev: CreateInvitationResult | null,
  formData: FormData,
): Promise<CreateInvitationResult> {
  const admin = await requireAdmin()

  const email = normalizeInviteEmail(String(formData.get("email") ?? ""))
  if (email === undefined) {
    return failure("Revisá el correo.", { email: ["No parece un correo válido."] })
  }

  try {
    const token = await insertInvitation(admin.id, email)
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
    revalidatePath(PATH)
    return { ok: true, link: new URL(`/invitacion/${token}`, base).toString() }
  } catch (error) {
    logDbError("createInvitation", error)
    return failure("No pudimos generar la invitación. Probá de nuevo.")
  }
}

const idSchema = z.string().uuid()

export async function revokeInvitation(id: string): Promise<ActionResult> {
  await requireAdmin()
  if (!idSchema.safeParse(id).success) return failure("Invitación inválida.")

  try {
    if (!(await revokeInvitationById(id))) {
      return failure("Esa invitación ya se usó o ya estaba revocada.")
    }
  } catch (error) {
    logDbError("revokeInvitation", error)
    return failure("No pudimos revocar la invitación. Probá de nuevo.")
  }

  revalidatePath(PATH)
  return success()
}

/**
 * Los ids de usuario los genera better-auth (no son UUID), así que sólo se
 * acota la forma. Que no sea el admin lo hace cumplir `setUserDisabled`.
 */
const userIdSchema = z.string().min(1).max(100)

export async function setUserAccess(userId: string, enabled: boolean): Promise<ActionResult> {
  const admin = await requireAdmin()
  if (!userIdSchema.safeParse(userId).success) return failure("Usuario inválido.")
  if (userId === admin.id) return failure("No podés quitarte el acceso a vos.")

  try {
    if (!(await setUserDisabled(userId, !enabled))) {
      return failure("No se puede cambiar el acceso de esa cuenta.")
    }
  } catch (error) {
    logDbError("setUserAccess", error)
    return failure("No pudimos cambiar el acceso. Probá de nuevo.")
  }

  revalidatePath(PATH)
  return success()
}
