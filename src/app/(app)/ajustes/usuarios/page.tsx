import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { InviteForm, RevokeInvitationButton, UserAccessButton } from "@/components/access-manager"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { invitationStatus, type InvitationStatus } from "@/lib/invitations"
import { listInvitations, listUsers } from "@/server/access"
import { requireAdmin } from "@/server/session"

const DATE = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const STATUS_BADGE: Record<InvitationStatus, { label: string; variant: "warning" | "success" | "secondary" }> = {
  pendiente: { label: "Pendiente", variant: "warning" },
  usada: { label: "Usada", variant: "success" },
  revocada: { label: "Revocada", variant: "secondary" },
  vencida: { label: "Vencida", variant: "secondary" },
}

/**
 * Quién entra a la instalación (§0.1 del plan v2). Sólo el admin llega acá, y
 * acá no hay un solo dato financiero de nadie: cada usuario lleva sus finanzas
 * y RLS se encarga de que nadie más las vea.
 */
export default async function UsuariosPage() {
  const admin = await requireAdmin()
  const [users, invitations] = await Promise.all([listUsers(), listInvitations()])
  const now = new Date()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link href="/ajustes" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-paper">
          <ChevronLeft className="size-4" aria-hidden />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold text-paper">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          La instalación es privada: solo entra quien invitás. Cada persona ve únicamente sus propias finanzas.
        </p>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Invitar a alguien</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Cuentas</CardTitle>
          <CardDescription>{users.length === 1 ? "1 persona" : `${users.length} personas`}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-paper">
                    <span className="truncate">{u.name}</span>
                    {u.role === "admin" && <Badge variant="outline">Admin</Badge>}
                    {u.disabledAt && <Badge variant="destructive">Sin acceso</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email} · desde {DATE.format(u.createdAt)}
                  </p>
                </div>
                {u.role !== "admin" && u.id !== admin.id && (
                  <UserAccessButton userId={u.id} name={u.name} disabled={Boolean(u.disabledAt)} />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Invitaciones</CardTitle>
          <CardDescription>Las últimas 50.</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no generaste ninguna.</p>
          ) : (
            <ul className="divide-y divide-border">
              {invitations.map((inv) => {
                const status = invitationStatus(inv, now)
                const badge = STATUS_BADGE[status]
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-paper">
                        <span className="truncate">{inv.email ?? "Cualquier correo"}</span>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Creada el {DATE.format(inv.createdAt)}
                        {status === "pendiente" && ` · vence el ${DATE.format(inv.expiresAt)}`}
                        {status === "usada" && inv.usedByEmail && ` · la usó ${inv.usedByEmail}`}
                      </p>
                    </div>
                    {status === "pendiente" && <RevokeInvitationButton id={inv.id} />}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
