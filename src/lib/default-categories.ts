import type { CategoryColorKey } from "@/lib/category-color"
import type { CategoryIconKey } from "@/lib/category-icons"

export type DefaultCategory = {
  name: string
  kind: "income" | "expense"
  color?: CategoryColorKey
  icon?: CategoryIconKey
  children?: { name: string; icon?: CategoryIconKey }[]
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Sueldo", kind: "income", icon: "sueldo" },
  { name: "Freelance", kind: "income", icon: "freelance" },
  { name: "Ventas", kind: "income", icon: "ventas" },
  { name: "Intereses", kind: "income", icon: "intereses" },
  { name: "Otros", kind: "income", icon: "otros" },
  {
    name: "Hogar",
    kind: "expense",
    color: "azul",
    icon: "hogar",
    children: [
      { name: "Alquiler", icon: "hogar" },
      { name: "Expensas", icon: "cuentas" },
      { name: "Servicios", icon: "servicios" },
      { name: "Mantenimiento", icon: "mantenimiento" },
    ],
  },
  {
    name: "Comida",
    kind: "expense",
    color: "amarillo",
    icon: "comida",
    children: [
      { name: "Supermercado", icon: "supermercado" },
      { name: "Delivery", icon: "compras" },
      { name: "Restaurantes", icon: "comida" },
    ],
  },
  {
    name: "Transporte",
    kind: "expense",
    color: "turquesa",
    icon: "auto",
    children: [
      { name: "Combustible", icon: "combustible" },
      { name: "Transporte público", icon: "colectivo" },
      { name: "Auto", icon: "auto" },
    ],
  },
  { name: "Salud", kind: "expense", color: "rosa", icon: "salud" },
  { name: "Educación", kind: "expense", color: "indigo", icon: "educacion" },
  { name: "Ocio", kind: "expense", color: "violeta", icon: "ocio" },
  { name: "Impuestos", kind: "expense", color: "celeste", icon: "impuestos" },
  { name: "Cargos financieros", kind: "expense", color: "magenta", icon: "cargos" },
  { name: "Otros", kind: "expense", icon: "otros" },
]
