"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  name,
  className,
  size = "default",
  wrap = false,
}: {
  label: string
  value: T
  onChange: (next: T) => void
  options: readonly { value: T; label: React.ReactNode; ariaLabel?: string }[]
  name?: string
  className?: string
  size?: "default" | "sm"
  wrap?: boolean
}) {
  const groupName = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex w-full rounded-lg bg-white/[0.04] p-0.5",
        wrap && "flex-wrap gap-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cn("relative cursor-pointer", wrap ? "flex-auto" : "min-w-0 flex-1")}
        >
          <input
            type="radio"
            name={name ?? groupName}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            aria-label={o.ariaLabel}
            className="peer sr-only"
          />
          <span
            className={cn(
              "flex items-center justify-center rounded-md px-2 text-center font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              size === "sm" ? "h-8 px-1.5 text-xs sm:px-2.5 sm:text-sm" : "h-9 text-sm",
              "peer-checked:bg-white/10 peer-checked:text-paper",
              "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </div>
  )
}
