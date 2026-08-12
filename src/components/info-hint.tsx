"use client"

import { Info } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * La explicación larga de una tarjeta, a un click del título en vez de
 * impresa debajo del número.
 *
 * Este dashboard tiene varias distinciones que de verdad hay que explicar
 * —caja contra devengado, tenencia contra saldo— y esos párrafos estaban
 * siempre a la vista, en `text-xs`, abajo de cada dato. El resultado era que
 * la tarjeta más chica del sistema (un título y un número) medía lo mismo que
 * un gráfico, y que el número —lo único que se viene a mirar— competía con
 * tres renglones de letra chica. El texto no se recorta ni se reescribe: se
 * corre acá adentro.
 *
 * `Popover` y no `Tooltip`: un tooltip se abre con el mouse y esta app ahora
 * se usa también desde el teléfono, donde no hay hover. El popover se abre con
 * click, con tap y con el teclado, que son los tres caminos que existen.
 */
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
