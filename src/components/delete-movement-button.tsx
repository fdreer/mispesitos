"use client"

import { useState, useTransition } from "react"
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
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { deleteMovement } from "@/server/actions/movements"

type DialogProps = {
  id: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Avisa que la acción está en vuelo, para que el disparador se apague. */
  onPendingChange?: (pending: boolean) => void
}

/**
 * La confirmación de borrado, sin disparador: la abre el botón "Borrar" de
 * /cambios o el ítem "Borrar" del menú ⋯ de cada fila de /ingresos y
 * /egresos. El resultado se avisa con un toast: el diálogo ya se cerró, así
 * que no hay dónde más mostrarlo.
 */
export function DeleteMovementDialog({
  id,
  description,
  open,
  onOpenChange,
  onPendingChange,
}: DialogProps) {
  const [, startTransition] = useTransition()

  function handleConfirm() {
    onPendingChange?.(true)
    startTransition(async () => {
      const result = await deleteMovement(id)
      onPendingChange?.(false)
      if (result.ok) toast.success("Borrado", { description })
      else toast.error(result.message)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar &ldquo;{description}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran también sus cuotas y no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm}>
            Borrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Botón suelto con su confirmación: el de cada operación de /cambios. */
export function DeleteMovementButton({ id, description }: { id: string; description: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {pending ? "Borrando…" : "Borrar"}
      </Button>
      <DeleteMovementDialog
        id={id}
        description={description}
        open={open}
        onOpenChange={setOpen}
        onPendingChange={setPending}
      />
    </>
  )
}
