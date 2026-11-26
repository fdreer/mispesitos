import { describe, expect, it } from "vitest"

import {
  ACCESS_DISABLED_MESSAGE,
  INVITE_INVALID_MESSAGE,
  INVITE_TTL_DAYS,
  SIGNUP_CLOSED_MESSAGE,
  authErrorMessage,
  generateInviteToken,
  hashInviteToken,
  invitationStatus,
  inviteExpiry,
  normalizeInviteEmail,
} from "@/lib/invitations"

describe("tokens de invitación", () => {
  it("son distintos cada vez y entran en una URL sin escapar", () => {
    const a = generateInviteToken()
    const b = generateInviteToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it("el hash es sha256 en hex, estable y distinto del token", () => {
    const token = generateInviteToken()
    expect(hashInviteToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInviteToken(token)).toBe(hashInviteToken(token))
    expect(hashInviteToken(token)).not.toContain(token)
  })

  it("vencen a los siete días", () => {
    const from = new Date("2026-11-26T12:00:00Z")
    expect(INVITE_TTL_DAYS).toBe(7)
    expect(inviteExpiry(from).toISOString()).toBe("2026-12-03T12:00:00.000Z")
  })
})

describe("invitationStatus", () => {
  const now = new Date("2026-11-26T12:00:00Z")
  const later = new Date("2026-11-30T00:00:00Z")
  const earlier = new Date("2026-11-20T00:00:00Z")

  it("pendiente si no se usó, no se revocó y no venció", () => {
    expect(invitationStatus({ usedAt: null, revokedAt: null, expiresAt: later }, now)).toBe("pendiente")
  })

  it("vencida justo en el instante de vencimiento", () => {
    expect(invitationStatus({ usedAt: null, revokedAt: null, expiresAt: now }, now)).toBe("vencida")
  })

  it("revocada le gana a vencida", () => {
    expect(invitationStatus({ usedAt: null, revokedAt: earlier, expiresAt: earlier }, now)).toBe("revocada")
  })

  it("usada le gana a todo: es lo que pasó con ella", () => {
    expect(invitationStatus({ usedAt: earlier, revokedAt: earlier, expiresAt: earlier }, now)).toBe("usada")
  })
})

describe("normalizeInviteEmail", () => {
  it("vacío significa cualquier correo", () => {
    expect(normalizeInviteEmail("   ")).toBeNull()
  })

  it("recorta y pasa a minúsculas", () => {
    expect(normalizeInviteEmail("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com")
  })

  it("devuelve undefined si no tiene forma de correo", () => {
    expect(normalizeInviteEmail("ana")).toBeUndefined()
    expect(normalizeInviteEmail("ana@ejemplo")).toBeUndefined()
  })
})

describe("authErrorMessage", () => {
  it("sin error no hay mensaje", () => {
    expect(authErrorMessage(undefined)).toBeNull()
  })

  it("traduce los códigos propios", () => {
    expect(authErrorMessage("SIGNUP_CLOSED")).toBe(SIGNUP_CLOSED_MESSAGE)
    expect(authErrorMessage("INVITE_INVALID")).toBe(INVITE_INVALID_MESSAGE)
    expect(authErrorMessage("ACCESS_DISABLED")).toBe(ACCESS_DISABLED_MESSAGE)
  })

  it("reconoce el mensaje con los espacios cambiados por guiones bajos", () => {
    expect(authErrorMessage(SIGNUP_CLOSED_MESSAGE.replaceAll(" ", "_"))).toBe(SIGNUP_CLOSED_MESSAGE)
  })

  it("cualquier otro error de better-auth cae en un mensaje genérico", () => {
    expect(authErrorMessage("invalid_code")).toMatch(/No pudimos completar el ingreso/)
  })
})
