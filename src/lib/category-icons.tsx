import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Coffee,
  CreditCard,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Package,
  PawPrint,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  ShoppingCart,
  Smartphone,
  Store,
  Tag,
  TrendingUp,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"

/**
 * Los iconos que se pueden elegir para una categoría (§2.1 del plan v2).
 *
 * Una lista curada y no "cualquier icono de lucide", por dos motivos. Uno: lo
 * que se guarda en `category.icon` es la clave, y un import dinámico por
 * nombre metería los ~1.500 iconos de lucide en el bundle del cliente; con la
 * lista, entran éstos y nada más. Dos: elegir entre 35 es una grilla que se
 * recorre de un vistazo; entre 1.500 es un buscador que nadie pidió.
 *
 * El orden es el de la grilla del selector: primero lo de egresos más común,
 * después lo de ingresos.
 *
 * Una clave guardada que ya no esté acá (si un día se saca un icono de la
 * lista) se muestra sin icono, no rompe: ver `categoryIcon`.
 */
export const CATEGORY_ICONS = {
  hogar: { label: "Hogar", Icon: House },
  supermercado: { label: "Supermercado", Icon: ShoppingCart },
  comida: { label: "Comida", Icon: Utensils },
  cafe: { label: "Café", Icon: Coffee },
  auto: { label: "Auto", Icon: Car },
  colectivo: { label: "Transporte público", Icon: Bus },
  combustible: { label: "Combustible", Icon: Fuel },
  salud: { label: "Salud", Icon: HeartPulse },
  educacion: { label: "Educación", Icon: GraduationCap },
  libros: { label: "Libros", Icon: BookOpen },
  ocio: { label: "Ocio", Icon: Gamepad2 },
  cine: { label: "Cine", Icon: Film },
  viajes: { label: "Viajes", Icon: Plane },
  ropa: { label: "Ropa", Icon: Shirt },
  regalos: { label: "Regalos", Icon: Gift },
  mascotas: { label: "Mascotas", Icon: PawPrint },
  hijos: { label: "Hijos", Icon: Baby },
  deporte: { label: "Deporte", Icon: Dumbbell },
  mantenimiento: { label: "Mantenimiento", Icon: Wrench },
  servicios: { label: "Servicios", Icon: Zap },
  internet: { label: "Internet", Icon: Wifi },
  celular: { label: "Celular", Icon: Smartphone },
  impuestos: { label: "Impuestos", Icon: Landmark },
  cuentas: { label: "Cuentas", Icon: Receipt },
  tarjeta: { label: "Tarjeta", Icon: CreditCard },
  cargos: { label: "Cargos", Icon: Percent },
  compras: { label: "Compras", Icon: Package },
  sueldo: { label: "Sueldo", Icon: Briefcase },
  freelance: { label: "Freelance", Icon: Laptop },
  ventas: { label: "Ventas", Icon: Store },
  intereses: { label: "Intereses", Icon: TrendingUp },
  ahorro: { label: "Ahorro", Icon: PiggyBank },
  efectivo: { label: "Efectivo", Icon: Banknote },
  cobros: { label: "Cobros", Icon: HandCoins },
  otros: { label: "Otros", Icon: Tag },
} satisfies Record<string, { label: string; Icon: LucideIcon }>

export type CategoryIconKey = keyof typeof CATEGORY_ICONS

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS) as [
  CategoryIconKey,
  ...CategoryIconKey[],
]

/** El componente de la clave guardada, o null si no hay o ya no existe. */
export function categoryIcon(key: string | null | undefined): LucideIcon | null {
  if (!key || !Object.hasOwn(CATEGORY_ICONS, key)) return null
  return CATEGORY_ICONS[key as CategoryIconKey].Icon
}
