"use client"

import { Info } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function InfoHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -m-1 inline-flex cursor-pointer rounded-md p-1 transition-colors outline-none focus-visible:ring-3"
        aria-label={label}
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="text-muted-foreground w-72 text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  )
}
