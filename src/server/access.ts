import "server-only"

import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { invitation, session, user } from "@/db/schema"
import { generateInviteToken, hashInviteToken, inviteExpiry } from "@/lib/invitations"

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM "user") AS "exists"`)
  return Boolean((rows[0] as { exists: boolean } | undefined)?.exists)
}

function validInvitationWhere(tokenHash: string, now: Date) {
  return and(
    eq(invitation.tokenHash, tokenHash),
    isNull(invitation.usedAt),
    isNull(invitation.revokedAt),
    gt(invitation.expiresAt, now),
  )
}

export async function findUsableInvitation(token: string) {
  const [row] = await db
    .select({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(validInvitationWhere(hashInviteToken(token), new Date()))
    .limit(1)
  return row ?? null
}

export async function claimInvitation(token: string, email: string): Promise<boolean> {
  const rows = await db
    .update(invitation)
    .set({ usedAt: new Date() })
    .where(
      and(
        validInvitationWhere(hashInviteToken(token), new Date()),
        or(isNull(invitation.email), sql`lower(${invitation.email}) = lower(${email})`),
      ),
    )
    .returning({ id: invitation.id })
  return rows.length === 1
}

/** Después del alta: deja registrado quién usó la invitación. */
export async function recordInvitationUser(token: string, userId: string): Promise<void> {
  await db
    .update(invitation)
    .set({ usedBy: userId })
    .where(and(eq(invitation.tokenHash, hashInviteToken(token)), isNull(invitation.usedBy)))
}

export async function isUserDisabled(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return Boolean(row?.disabledAt)
}

export async function getUserRole(userId: string): Promise<"admin" | "member" | null> {
  const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
  if (!row) return null
  return row.role === "admin" ? "admin" : "member"
}

// ---------------------------------------------------------------------------
// Pantalla del admin
// ---------------------------------------------------------------------------

export async function listUsers() {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      disabledAt: user.disabledAt,
    })
    .from(user)
    .orderBy(asc(user.createdAt))
}

export async function listInvitations() {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      usedAt: invitation.usedAt,
      revokedAt: invitation.revokedAt,
      usedByEmail: user.email,
    })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.usedBy))
    .orderBy(desc(invitation.createdAt))
    .limit(50)
}

/** Devuelve el token en claro: es la única vez que existe fuera del link. */
export async function insertInvitation(createdBy: string, email: string | null) {
  const token = generateInviteToken()
  const now = new Date()
  await db.insert(invitation).values({
    id: crypto.randomUUID(),
    tokenHash: hashInviteToken(token),
    email,
    createdBy,
    createdAt: now,
    expiresAt: inviteExpiry(now),
  })
  return token
}

export async function revokeInvitationById(id: string): Promise<boolean> {
  const rows = await db
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitation.id, id), isNull(invitation.usedAt), isNull(invitation.revokedAt)))
    .returning({ id: invitation.id })
  return rows.length === 1
}

/**
 * Quitar o devolver el acceso. Al quitarlo se borran sus sesiones en la misma
 * transacción: sin eso, quien ya estaba adentro seguiría hasta que su sesión
 * venza. Sus datos no se tocan. Nunca aplica al admin (ni a uno mismo).
 */
export async function setUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(user)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(and(eq(user.id, userId), eq(user.role, "member")))
      .returning({ id: user.id })
    if (rows.length !== 1) return false
    if (disabled) await tx.delete(session).where(eq(session.userId, userId))
    return true
  })
}
