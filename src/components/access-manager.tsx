"use client"

import { useActionState, useState, useTransition } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createInvitation,
  revokeInvitation,
  setUserAccess,
} from "@/server/actions/access"

export function InviteForm() {
  const [state, action, pending] = useActionState(createInvitation, null)
  const [copied, setCopied] = useState(false)

  const link = state?.ok && "link" in state ? state.link : null
  const emailError = state && !state.ok ? state.fieldErrors?.email?.[0] : undefined

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
    }
  }

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-2" onSubmit={() => setCopied(false)}>
        <Label htmlFor="invite-email">Correo (opcional)</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="Cualquiera con el link"
            aria-invalid={emailError ? true : undefined}
            aria-describedby="invite-email-hint"
            className="h-10"
          />
          <Button type="submit" className="h-10 shrink-0" disabled={pending}>
            {pending ? "Generando…" : "Generar invitación"}
          </Button>
        </div>
        <p id="invite-email-hint" className="text-muted-foreground text-xs">
          Si ponés un correo, solo esa persona puede usarla. Vence en 7 días y sirve para una sola cuenta.
        </p>
        {emailError && <p className="text-destructive text-xs">{emailError}</p>}
        {state && !state.ok && !emailError && (
          <p role="alert" className="text-destructive text-xs">{state.message}</p>
        )}
      </form>

      {link && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" aria-live="polite">
          <p className="text-sm text-paper">Copiá el link y mandáselo. No se vuelve a mostrar.</p>
          <div className="flex gap-2">
            <Input value={link} readOnly className="h-10 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Link de invitación" />
            <Button type="button" variant="outline" className="h-10 shrink-0 gap-2" onClick={copy}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function RevokeInvitationButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await revokeInvitation(id)
            if (!result.ok) setError(result.message)
            else toast.success("Invitación revocada")
          })
        }
      >
        {pending ? "Revocando…" : "Revocar"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

export function UserAccessButton({
  userId,
  name,
  disabled,
}: {
  userId: string
  name: string
  disabled: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function apply(enabled: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setUserAccess(userId, enabled)
      if (!result.ok) setError(result.message)
      else toast.success(enabled ? `${name} tiene acceso otra vez` : `${name} ya no tiene acceso`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {disabled ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => apply(true)}>
          {pending ? "Un segundo…" : "Devolver acceso"}
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending} className="text-coral-red hover:text-coral-red">
              {pending ? "Un segundo…" : "Quitar acceso"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Quitarle el acceso a {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se cierran sus sesiones y no va a poder entrar. Sus datos no se borran: podés devolverle el acceso cuando quieras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => apply(false)}>Quitar acceso</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
