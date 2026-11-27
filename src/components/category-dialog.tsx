"use client"

import { useActionState, useState } from "react"
import { toast } from "sonner"

import { ColorSwatchField } from "@/components/color-swatch-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActionSuccess } from "@/hooks/use-action-success"
import { resolveCategoryHue } from "@/lib/category-color"
import { CATEGORY_ICONS, type CategoryIconKey } from "@/lib/category-icons"
import { isLeafCategory, moveTargets } from "@/lib/category-tree"
import { createCategory, moveCategory, updateCategory } from "@/server/actions/categories"
import type { ActionResult } from "@/server/actions/result"
import type { Category } from "@/server/queries"

export type CategoryDialogMode =
  | { type: "create-child"; parent: Category }
  | { type: "edit"; category: Category }
  | { type: "move"; category: Category }

type Props = {
  kind: "income" | "expense"
  categories: Category[]
  movementCounts: Record<string, number>
  mode: CategoryDialogMode | null
  onClose: () => void
}

const TITLES = {
  "create-child": "Nueva subcategoría",
  edit: "Editar categoría",
  move: "Mover categoría",
} as const

export function CategoryDialog({ mode, onClose, ...rest }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {mode && <CategoryDialogForm key={JSON.stringify(mode)} mode={mode} onClose={onClose} {...rest} />}
      </DialogContent>
    </Dialog>
  )
}

function CategoryDialogForm({
  kind,
  categories,
  movementCounts,
  mode,
  onClose,
}: Omit<Props, "mode"> & { mode: CategoryDialogMode }) {
  const actionFor = { "create-child": createCategory, edit: updateCategory, move: moveCategory }
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    actionFor[mode.type],
    null,
  )

  const target = mode.type === "create-child" ? mode.parent : mode.category
  const [name, setName] = useState(mode.type === "edit" ? mode.category.name : "")
  const [parentId, setParentId] = useState(
    mode.type === "move" ? (mode.category.parentId ?? "") : "",
  )

  useActionSuccess(state, () => {
    toast.success(
      mode.type === "create-child"
        ? "Subcategoría creada"
        : mode.type === "edit"
          ? "Categoría guardada"
          : "Categoría movida",
    )
    onClose()
  })

  const receivingParent =
    mode.type === "create-child"
      ? mode.parent
      : mode.type === "move" && parentId !== ""
        ? categories.find((c) => c.id === parentId)
        : undefined
  const movementsToMove =
    receivingParent && isLeafCategory(categories, receivingParent.id)
      ? (movementCounts[receivingParent.id] ?? 0)
      : 0

  const parentOf = (c: Category) =>
    c.parentId === null ? null : (categories.find((p) => p.id === c.parentId) ?? null)

  return (
    <form action={action} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{TITLES[mode.type]}</DialogTitle>
        <DialogDescription>
          {mode.type === "create-child" && `Adentro de ${mode.parent.name}.`}
          {mode.type === "edit" && "El nombre, el color y el icono."}
          {mode.type === "move" &&
            `Dónde va ${mode.category.name}. Sus movimientos no cambian de categoría.`}
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="kind" value={kind} />
      {mode.type === "create-child" && (
        <input type="hidden" name="parentId" value={mode.parent.id} />
      )}
      {mode.type !== "create-child" && <input type="hidden" name="id" value={target.id} />}

      {mode.type !== "move" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="category-name">Nombre</Label>
            <Input
              id="category-name"
              name="name"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-10"
            />
          </div>
          <ColorSwatchField
            defaultValue={mode.type === "edit" ? mode.category.color : null}
            // Lo que se ve con "Automático": lo heredado del padre, o el hash.
            automaticHue={
              mode.type === "create-child"
                ? resolveCategoryHue(mode.parent, null)
                : resolveCategoryHue(
                    { name: mode.category.name, color: null },
                    parentOf(mode.category),
                  )
            }
            automaticLabel={
              mode.type === "create-child" || mode.category.parentId !== null
                ? "Automático (el del padre)"
                : "Automático"
            }
          />
          <IconField defaultValue={mode.type === "edit" ? mode.category.icon : null} />
        </>
      )}

      {mode.type === "move" && (
        <div className="space-y-2">
          <Label htmlFor="category-parent">Mover a</Label>
          <input type="hidden" name="parentId" value={parentId} />
          {/* Un <select> nativo: es una lista corta de padres, y en el
              teléfono abre el selector del sistema, que es el más cómodo. */}
          <select
            id="category-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-transparent bg-white/[0.04] px-3 text-sm outline-none transition-colors hover:bg-white/[0.06] focus-visible:border-white/15"
          >
            <option value="">Primer nivel (sin categoría padre)</option>
            {moveTargets(categories, mode.category.id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!isLeafCategory(categories, mode.category.id) && (
            <p className="text-muted-foreground text-xs">
              Tiene subcategorías, así que sólo puede estar en el primer nivel.
            </p>
          )}
        </div>
      )}

      {movementsToMove > 0 && receivingParent && (
        <fieldset className="space-y-2 rounded-lg bg-white/[0.03] px-3.5 py-3">
          <legend className="px-1 text-xs text-muted-foreground">
            {receivingParent.name} tiene {movementsToMove}{" "}
            {movementsToMove === 1 ? "movimiento" : "movimientos"}
          </legend>
          <p className="text-muted-foreground text-xs">
            Una categoría con subcategorías no lleva movimientos propios: ¿a cuál
            subcategoría pasan?
          </p>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="radio" name="movementsTo" value="general" defaultChecked />
            A una nueva &ldquo;General&rdquo;
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="radio" name="movementsTo" value="child" />
            {mode.type === "create-child"
              ? `A ${name.trim() ? `“${name.trim()}”` : "la que estás creando"}`
              : `A “${target.name}”`}
          </label>
        </fieldset>
      )}

      {state && !state.ok && <p className="text-destructive text-sm">{state.message}</p>}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {mode.type === "create-child" ? "Crear" : mode.type === "edit" ? "Guardar" : "Mover"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function IconField({ defaultValue }: { defaultValue: string | null }) {
  const keys = Object.keys(CATEGORY_ICONS) as CategoryIconKey[]
  const current = defaultValue && keys.includes(defaultValue as CategoryIconKey) ? defaultValue : ""
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-muted-foreground">Icono</legend>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
        <label className="cursor-pointer" title="Sin icono">
          <input
            type="radio"
            name="icon"
            value=""
            defaultChecked={current === ""}
            aria-label="Sin icono"
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-lg border border-transparent bg-white/[0.04] text-xs text-muted-foreground transition-colors hover:bg-white/[0.07] peer-checked:border-white/30 peer-checked:bg-white/10 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
          >
            —
          </span>
        </label>
        {keys.map((key) => {
          const { label, Icon } = CATEGORY_ICONS[key]
          return (
            <label key={key} className="cursor-pointer" title={label}>
              <input
                type="radio"
                name="icon"
                value={key}
                defaultChecked={current === key}
                aria-label={label}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="flex size-9 items-center justify-center rounded-lg border border-transparent bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.07] peer-checked:border-white/30 peer-checked:bg-white/10 peer-checked:text-paper peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
              >
                <Icon className="size-4" />
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
