import { createHash, randomBytes } from "node:crypto"

/** Cookie que guarda el token de la invitación entre el link y el alta. */
export const INVITE_COOKIE = "mp_invitacion"

/** Cuánto dura una invitación desde que se genera. */
export const INVITE_TTL_DAYS = 7

/**
 * 32 bytes aleatorios en base64url: entra en una URL sin escapar y no se
 * adivina. Se muestra una sola vez; en la base queda sólo su hash.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url")
}

/** sha256 en hex. Sin sal a propósito: el token ya tiene 256 bits de azar. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function inviteExpiry(from: Date): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export type InvitationStatus = "pendiente" | "usada" | "revocada" | "vencida"

/**
 * El orden importa: una invitación usada sigue "usada" aunque después venza o
 * la revoquen, porque eso es lo que pasó con ella.
 */
export function invitationStatus(
  inv: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InvitationStatus {
  if (inv.usedAt) return "usada"
  if (inv.revokedAt) return "revocada"
  if (inv.expiresAt.getTime() <= now.getTime()) return "vencida"
  return "pendiente"
}

/**
 * Normaliza el email opcional de una invitación: vacío es "cualquiera".
 * Devuelve `undefined` si no tiene forma de email, para que la acción lo
 * informe como error de campo.
 */
export function normalizeInviteEmail(raw: string): string | null | undefined {
  const email = raw.trim().toLowerCase()
  if (!email) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined
  return email
}

/** Mensajes que ve quien intenta registrarse. Centralizados para los tests. */
export const SIGNUP_CLOSED_MESSAGE =
  "Esta instalación es privada. Para crear una cuenta necesitás una invitación."
export const INVITE_INVALID_MESSAGE =
  "La invitación no es válida: ya se usó, venció, fue revocada o es para otro correo."
export const ACCESS_DISABLED_MESSAGE = "Tu acceso a esta instalación fue desactivado."

/**
 * Código que acompaña a cada rechazo. Hace falta porque el callback de Google
 * no muestra el mensaje: redirige con `?error=` y, según en qué paso falló,
 * better-auth pone el `code` del error o el mensaje con los espacios cambiados
 * por "_". `authErrorMessage` entiende las dos formas.
 */
export const AUTH_ERROR_CODES = {
  SIGNUP_CLOSED: SIGNUP_CLOSED_MESSAGE,
  INVITE_INVALID: INVITE_INVALID_MESSAGE,
  ACCESS_DISABLED: ACCESS_DISABLED_MESSAGE,
} as const

export type AuthErrorCode = keyof typeof AUTH_ERROR_CODES

const GENERIC_AUTH_ERROR = "No pudimos completar el ingreso. Probá de nuevo."

/** Traduce el `?error=` con que vuelve un ingreso con Google fallido. */
export function authErrorMessage(param: string | undefined): string | null {
  if (!param) return null
  if (param in AUTH_ERROR_CODES) return AUTH_ERROR_CODES[param as AuthErrorCode]
  const asText = param.replaceAll("_", " ")
  const known = Object.values(AUTH_ERROR_CODES).find((m) => m === asText)
  return known ?? GENERIC_AUTH_ERROR
}
