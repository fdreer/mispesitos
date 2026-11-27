import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-transparent bg-white/[0.04] px-3 py-1 text-base transition-colors outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:border-white/15 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive/60 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
