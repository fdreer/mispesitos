"use client"

import { useLinkStatus } from "next/link"

import { cn } from "@/lib/utils"

/**
 * Atenúa su contenido mientras el `Link` que lo contiene está navegando.
 *
 * La regla de la §7.4 del spec —cualquier control que navegue en vez de mutar
 * estado local tiene que avisar que está pendiente— la cumplía la barra de
 * filtros con `useTransition`, pero no el paginador: es un server component,
 * así que no tiene hooks. `useLinkStatus` resuelve justo eso: lo provee el
 * propio `Link` de Next, así que alcanza con este envoltorio adentro del
 * enlace, sin subir estado ni convertir el paginador en cliente.
 *
 * Sólo se atenúa el enlace clickeado, no la tabla ni la barra: el hook informa
 * el estado del `Link` más cercano y nada más. Es la señal mínima —"tomé el
 * click, estoy yendo"— que es lo que faltaba.
 */
export function LinkPending({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { pending } = useLinkStatus()

  return (
    <span
      className={cn("transition-opacity", pending && "animate-pulse opacity-60", className)}
      aria-busy={pending || undefined}
    >
      {children}
    </span>
  )
}
