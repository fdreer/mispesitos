"use client"

import { useLinkStatus } from "next/link"

import { cn } from "@/lib/utils"

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
